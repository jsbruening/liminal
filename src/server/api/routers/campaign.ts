import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { requireMember } from "~/server/api/permissions";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const campaignRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await requireMember(
        ctx.db,
        input.campaignId,
        ctx.session.user.id,
      );
      return { ...campaign, isGm: campaign.gmId === ctx.session.user.id };
    }),

  // GM-only: every character currently in the campaign, for token placement.
  listMemberCharacters: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await requireMember(
        ctx.db,
        input.campaignId,
        ctx.session.user.id,
      );
      if (campaign.gmId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const links = await ctx.db.characterCampaign.findMany({
        where: { campaignId: input.campaignId },
        include: { character: true },
      });
      return links.map((l) => l.character);
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        isPubliclyListed: z.boolean().default(true),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.campaign.create({
        data: {
          name: input.name,
          isPubliclyListed: input.isPubliclyListed,
          gmId: ctx.session.user.id,
        },
      }),
    ),

  // Campaigns the current user GMs, or is a member of — enriched with the
  // fields the dashboard cards need (GM name, player count, active scene
  // name). "Last played" isn't tracked explicitly; updatedAt is used as an
  // approximation.
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const include = {
      gm: { select: { name: true, email: true } },
      activeScene: { select: { name: true } },
      _count: { select: { members: true } },
    } as const;
    const [gmed, joined] = await Promise.all([
      ctx.db.campaign.findMany({
        where: { gmId: userId },
        orderBy: { updatedAt: "desc" },
        include,
      }),
      ctx.db.campaign.findMany({
        where: { members: { some: { userId } } },
        orderBy: { updatedAt: "desc" },
        include,
      }),
    ]);
    return { gmed, joined };
  }),

  // Publicly listed campaigns the user neither GMs nor has already joined,
  // annotated with their most recent join request status (if any).
  listPublic: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const campaigns = await ctx.db.campaign.findMany({
      where: {
        isPubliclyListed: true,
        gmId: { not: userId },
        members: { none: { userId } },
      },
      orderBy: { createdAt: "desc" },
      include: {
        joinRequests: {
          where: { requesterId: userId },
          orderBy: { requestedAt: "desc" },
          take: 1,
        },
      },
    });

    return campaigns.map((c) => ({
      ...c,
      myLatestRequestStatus: c.joinRequests[0]?.status ?? null,
      joinRequests: undefined,
    }));
  }),

  requestToJoin: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        characterId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (input.characterId) {
        const character = await ctx.db.character.findUnique({
          where: { id: input.characterId },
        });
        if (character?.ownerId !== userId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      return ctx.db.campaignJoinRequest.create({
        data: {
          campaignId: input.campaignId,
          requesterId: userId,
          characterId: input.characterId,
        },
      });
    }),

  // GM-only: pending join requests for one of their campaigns.
  listJoinRequests: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.db.campaign.findUnique({
        where: { id: input.campaignId },
      });
      if (campaign?.gmId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return ctx.db.campaignJoinRequest.findMany({
        where: { campaignId: input.campaignId, status: "PENDING" },
        orderBy: { requestedAt: "asc" },
        include: { requester: true, character: true },
      });
    }),

  respondToJoinRequest: protectedProcedure
    .input(
      z.object({
        joinRequestId: z.string(),
        approve: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const joinRequest = await ctx.db.campaignJoinRequest.findUnique({
        where: { id: input.joinRequestId },
        include: { campaign: true },
      });
      if (joinRequest?.campaign.gmId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (!input.approve) {
        return ctx.db.campaignJoinRequest.update({
          where: { id: input.joinRequestId },
          data: {
            status: "REJECTED",
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
          },
        });
      }

      return ctx.db.$transaction(async (tx) => {
        await tx.campaignJoinRequest.update({
          where: { id: input.joinRequestId },
          data: {
            status: "APPROVED",
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
          },
        });

        await tx.campaignMember.upsert({
          where: {
            campaignId_userId: {
              campaignId: joinRequest.campaignId,
              userId: joinRequest.requesterId,
            },
          },
          update: {},
          create: {
            campaignId: joinRequest.campaignId,
            userId: joinRequest.requesterId,
          },
        });

        if (joinRequest.characterId) {
          await tx.characterCampaign.upsert({
            where: {
              characterId_campaignId: {
                characterId: joinRequest.characterId,
                campaignId: joinRequest.campaignId,
              },
            },
            update: {},
            create: {
              characterId: joinRequest.characterId,
              campaignId: joinRequest.campaignId,
            },
          });
        }

        return tx.campaignJoinRequest.findUniqueOrThrow({
          where: { id: input.joinRequestId },
        });
      });
    }),

  // Leaving a campaign also removes the user's characters from it and
  // despawns their tokens from every scene in that campaign (see the
  // CampaignMember model comment in schema.prisma for why this can't be a
  // plain cascade).
  leave: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const membership = await ctx.db.campaignMember.findUnique({
        where: { campaignId_userId: { campaignId: input.campaignId, userId } },
      });
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const myCharacterIds = (
        await ctx.db.character.findMany({
          where: {
            ownerId: userId,
            campaigns: { some: { campaignId: input.campaignId } },
          },
          select: { id: true },
        })
      ).map((c) => c.id);

      await ctx.db.$transaction([
        ctx.db.token.deleteMany({
          where: {
            characterId: { in: myCharacterIds },
            scene: { campaignId: input.campaignId },
          },
        }),
        ctx.db.characterCampaign.deleteMany({
          where: {
            campaignId: input.campaignId,
            characterId: { in: myCharacterIds },
          },
        }),
        ctx.db.campaignMember.delete({
          where: { campaignId_userId: { campaignId: input.campaignId, userId } },
        }),
      ]);

      return { left: true };
    }),
});
