import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireGm, requireMember } from "~/server/api/permissions";
import { emitToRoom, rooms } from "~/server/socket";

export const sceneRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        name: z.string().min(1).max(100),
        mapImageUrl: z.string(),
        widthPx: z.number().int().positive(),
        heightPx: z.number().int().positive(),
        gridSize: z.number().int().positive().default(70),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);
      const scene = await ctx.db.scene.create({ data: input });
      emitToRoom(rooms.campaign(input.campaignId), "campaign:changed");
      return scene;
    }),

  get: protectedProcedure
    .input(z.object({ sceneId: z.string() }))
    .query(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({
        where: { id: input.sceneId },
      });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireMember(ctx.db, scene.campaignId, ctx.session.user.id);
      return scene;
    }),

  listForCampaign: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireMember(ctx.db, input.campaignId, ctx.session.user.id);
      return ctx.db.scene.findMany({
        where: { campaignId: input.campaignId },
        orderBy: { createdAt: "asc" },
      });
    }),

  setActive: protectedProcedure
    .input(z.object({ campaignId: z.string(), sceneId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);

      if (input.sceneId) {
        const scene = await ctx.db.scene.findUnique({
          where: { id: input.sceneId },
        });
        // Enforced here, not by the schema: a campaign's active scene must
        // belong to that same campaign (see schema.prisma comment).
        if (scene?.campaignId !== input.campaignId) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
      }

      const updated = await ctx.db.campaign.update({
        where: { id: input.campaignId },
        data: { activeSceneId: input.sceneId },
      });
      emitToRoom(rooms.campaign(input.campaignId), "campaign:changed");
      return updated;
    }),

  updateGridSize: protectedProcedure
    .input(z.object({ sceneId: z.string(), gridSize: z.number().int().min(10).max(400) }))
    .mutation(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({
        where: { id: input.sceneId },
      });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, scene.campaignId, ctx.session.user.id);

      const updated = await ctx.db.scene.update({
        where: { id: input.sceneId },
        data: { gridSize: input.gridSize },
      });
      emitToRoom(rooms.scene(input.sceneId), "scene:changed");
      return updated;
    }),

  toggleFogLifted: protectedProcedure
    .input(z.object({ sceneId: z.string(), fogLifted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({
        where: { id: input.sceneId },
      });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, scene.campaignId, ctx.session.user.id);

      const updated = await ctx.db.scene.update({
        where: { id: input.sceneId },
        data: { fogLifted: input.fogLifted },
      });
      emitToRoom(rooms.scene(input.sceneId), "scene:changed");
      return updated;
    }),

  // Any campaign member can ping — a transient, non-persisted "look here" /
  // "targeting this" marker broadcast live to everyone on the scene. Not
  // stored anywhere; see emitToRoom's payload note for why this is fine to
  // push directly rather than going through the usual refetch pattern.
  ping: protectedProcedure
    .input(z.object({ sceneId: z.string(), x: z.number(), y: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({
        where: { id: input.sceneId },
      });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireMember(ctx.db, scene.campaignId, ctx.session.user.id);

      emitToRoom(rooms.scene(input.sceneId), "scene:ping", {
        x: input.x,
        y: input.y,
        userId: ctx.session.user.id,
        name: ctx.session.user.name ?? "Someone",
      });
      return { sent: true };
    }),

  delete: protectedProcedure
    .input(z.object({ sceneId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({
        where: { id: input.sceneId },
      });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, scene.campaignId, ctx.session.user.id);

      const deleted = await ctx.db.scene.delete({ where: { id: input.sceneId } });
      emitToRoom(rooms.campaign(scene.campaignId), "campaign:changed");
      return deleted;
    }),
});
