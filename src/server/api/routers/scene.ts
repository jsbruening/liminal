import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireGm, requireMember } from "~/server/api/permissions";

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
      return ctx.db.scene.create({ data: input });
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
        if (!scene || scene.campaignId !== input.campaignId) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
      }

      return ctx.db.campaign.update({
        where: { id: input.campaignId },
        data: { activeSceneId: input.sceneId },
      });
    }),

  toggleFogLifted: protectedProcedure
    .input(z.object({ sceneId: z.string(), fogLifted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({
        where: { id: input.sceneId },
      });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, scene.campaignId, ctx.session.user.id);

      return ctx.db.scene.update({
        where: { id: input.sceneId },
        data: { fogLifted: input.fogLifted },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ sceneId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({
        where: { id: input.sceneId },
      });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, scene.campaignId, ctx.session.user.id);

      return ctx.db.scene.delete({ where: { id: input.sceneId } });
    }),
});
