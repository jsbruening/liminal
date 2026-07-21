import { TRPCError } from "@trpc/server";

import { type db as Db } from "~/server/db";

// True if the user is the campaign owner OR a co-GM. Co-GMs get full
// in-session GM powers (scenes, tokens, NPCs, join requests) but not
// ownership-level actions — see requireOwner.
export async function isGmOrCoGm(db: typeof Db, campaignId: string, userId: string): Promise<boolean> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return false;
  if (campaign.gmId === userId) return true;
  const member = await db.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  return member?.isCoGm ?? false;
}

// Owner or co-GM: the day-to-day "running the campaign" permission level.
export async function requireGm(db: typeof Db, campaignId: string, userId: string) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
  if (campaign.gmId !== userId) {
    const member = await db.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
    });
    if (!member?.isCoGm) throw new TRPCError({ code: "FORBIDDEN" });
  }
  return campaign;
}

// Strictly the campaign owner — for actions a co-GM shouldn't be able to do
// (transferring the GM mantle, promoting/demoting other co-GMs).
export async function requireOwner(db: typeof Db, campaignId: string, userId: string) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
  if (campaign.gmId !== userId) throw new TRPCError({ code: "FORBIDDEN" });
  return campaign;
}

// Owner/co-GM, or any approved CampaignMember. isGm reflects owner-or-co-GM.
export async function requireMember(db: typeof Db, campaignId: string, userId: string) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
  if (campaign.gmId === userId) return { campaign, isGm: true };
  const member = await db.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  if (!member) throw new TRPCError({ code: "FORBIDDEN" });
  return { campaign, isGm: member.isCoGm };
}

export async function requireOwnedCharacter(db: typeof Db, characterId: string, userId: string) {
  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character) throw new TRPCError({ code: "NOT_FOUND" });
  if (character.ownerId !== userId) throw new TRPCError({ code: "FORBIDDEN" });
  return character;
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
      scene: {
        include: {
          campaign: {
            include: { members: { where: { userId, isCoGm: true }, take: 1 } },
          },
        },
      },
      controllers: true,
    },
  });
  if (!token) return { token: null, allowed: false };

  const allowed =
    token.scene.campaign.gmId === userId ||
    token.scene.campaign.members.length > 0 ||
    token.character?.ownerId === userId ||
    token.controllers.some((c) => c.controlledById === userId);

  return { token, allowed };
}
