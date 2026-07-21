import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { requireGm, requireMember, requireOwner } from "~/server/api/permissions";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { emitToRoom, rooms } from "~/server/socket";

export const campaignRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { campaign, isGm } = await requireMember(
        ctx.db,
        input.campaignId,
        ctx.session.user.id,
      );
      return { ...campaign, isGm, isOwner: campaign.gmId === ctx.session.user.id };
    }),

  // GM/co-GM only: every character currently in the campaign, for token placement.
  listMemberCharacters: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);
      const links = await ctx.db.characterCampaign.findMany({
        where: { campaignId: input.campaignId },
        include: { character: true },
      });
      return links.map((l) => l.character);
    }),

  // Any campaign member: their own character(s) in this campaign (with
  // ddbSheet) — used by the in-session dice roller to know what to show.
  listMyCharacters: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireMember(ctx.db, input.campaignId, ctx.session.user.id);
      const links = await ctx.db.characterCampaign.findMany({
        where: { campaignId: input.campaignId, character: { ownerId: ctx.session.user.id } },
        include: { character: true },
      });
      return links.map((l) => l.character);
    }),

  // GM-only: add one of the GM's own characters to their own campaign's
  // roster, bypassing the join-request flow (which is for other players —
  // "Browse campaigns" deliberately excludes campaigns the user already GMs,
  // so a GM has no other path to bring their own character in).
  addOwnCharacter: protectedProcedure
    .input(z.object({ campaignId: z.string(), characterId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);

      const character = await ctx.db.character.findUnique({
        where: { id: input.characterId },
      });
      if (character?.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return ctx.db.characterCampaign.upsert({
        where: {
          characterId_campaignId: {
            characterId: input.characterId,
            campaignId: input.campaignId,
          },
        },
        update: {},
        create: { characterId: input.characterId, campaignId: input.campaignId },
      });
    }),

  // GM-only: set the avatar for any character in this campaign's roster
  // (not just the GM's own) — lets the GM art-up the stage from the sidebar
  // without each player having to do it themselves from /characters. Scoped
  // to avatar only, not full character edit rights.
  setCharacterAvatar: protectedProcedure
    .input(z.object({ campaignId: z.string(), characterId: z.string(), tokenUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);

      const link = await ctx.db.characterCampaign.findUnique({
        where: {
          characterId_campaignId: {
            characterId: input.characterId,
            campaignId: input.campaignId,
          },
        },
      });
      if (!link) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.character.update({
        where: { id: input.characterId },
        data: { tokenUrl: input.tokenUrl },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        isPubliclyListed: z.boolean().default(true),
        coverImageUrl: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.campaign.create({
        data: {
          name: input.name,
          isPubliclyListed: input.isPubliclyListed,
          coverImageUrl: input.coverImageUrl,
          gmId: ctx.session.user.id,
        },
      }),
    ),

  // GM/co-GM only: every member of the campaign, with co-GM status, for the
  // members panel (GM transfer + co-GM toggle).
  listMembers: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);

      const members = await ctx.db.campaignMember.findMany({
        where: { campaignId: input.campaignId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      });
      return members.map((m) => ({ ...m.user, isCoGm: m.isCoGm }));
    }),

  // Owner-only: hand the GM mantle to another campaign member. The mantle is
  // fully transferable — the outgoing GM becomes a regular member and loses
  // GM-only UI immediately on their next campaign.get refetch.
  transferGm: protectedProcedure
    .input(z.object({ campaignId: z.string(), newGmId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireOwner(ctx.db, input.campaignId, ctx.session.user.id);

      const newGmMembership = await ctx.db.campaignMember.findUnique({
        where: { campaignId_userId: { campaignId: input.campaignId, userId: input.newGmId } },
      });
      if (!newGmMembership) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That user isn't a member of this campaign." });
      }

      const updated = await ctx.db.campaign.update({
        where: { id: input.campaignId },
        data: { gmId: input.newGmId },
      });

      emitToRoom(rooms.campaign(input.campaignId), "campaign:changed");

      return updated;
    }),

  // Owner-only: promote/demote a member to co-GM. Co-GMs get full in-session
  // GM powers but can't transfer the mantle or manage other co-GMs.
  setCoGm: protectedProcedure
    .input(z.object({ campaignId: z.string(), userId: z.string(), isCoGm: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireOwner(ctx.db, input.campaignId, ctx.session.user.id);

      const updated = await ctx.db.campaignMember.update({
        where: { campaignId_userId: { campaignId: input.campaignId, userId: input.userId } },
        data: { isCoGm: input.isCoGm },
      });

      emitToRoom(rooms.campaign(input.campaignId), "campaign:changed");

      return updated;
    }),

  // GM/co-GM only: set or replace the campaign's cover image.
  setCoverImage: protectedProcedure
    .input(z.object({ campaignId: z.string(), coverImageUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);

      return ctx.db.campaign.update({
        where: { id: input.campaignId },
        data: { coverImageUrl: input.coverImageUrl },
      });
    }),

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
        where: { OR: [{ gmId: userId }, { members: { some: { userId, isCoGm: true } } }] },
        orderBy: { updatedAt: "desc" },
        include,
      }),
      ctx.db.campaign.findMany({
        where: { members: { some: { userId, isCoGm: false } } },
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

  // GM/co-GM only: pending join requests for one of their campaigns.
  listJoinRequests: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);

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
      if (!joinRequest) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, joinRequest.campaignId, ctx.session.user.id);

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
