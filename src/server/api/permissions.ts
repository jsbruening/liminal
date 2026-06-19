import { TRPCError } from "@trpc/server";

import { type db as Db } from "~/server/db";

export async function requireGm(db: typeof Db, campaignId: string, userId: string) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (campaign?.gmId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return campaign;
}

// GM or any approved CampaignMember.
export async function requireMember(db: typeof Db, campaignId: string, userId: string) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
  if (campaign.gmId === userId) return campaign;
  const member = await db.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  if (!member) throw new TRPCError({ code: "FORBIDDEN" });
  return campaign;
}

// A token can always be moved by the campaign's GM or the owner of the
// character it represents; additional users can be granted control via
// TokenController (see schema.prisma for why those defaults aren't rows).
export async function canControlToken(
  db: typeof Db,
  tokenId: string,
  userId: string,
) {
  const token = await db.token.findUnique({
    where: { id: tokenId },
    include: {
      character: true,
      scene: { include: { campaign: true } },
      controllers: true,
    },
  });
  if (!token) return { token: null, allowed: false };

  const allowed =
    token.scene.campaign.gmId === userId ||
    token.character?.ownerId === userId ||
    token.controllers.some((c) => c.controlledById === userId);

  return { token, allowed };
}
