import { TRPCError } from "@trpc/server";
import { type Prisma } from "generated/prisma";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { isGmOrCoGm, requireMember } from "~/server/api/permissions";
import { emitToRoom, rooms } from "~/server/socket";

export const overlayRouter = createTRPCRouter({
  listForScene: protectedProcedure
    .input(z.object({ sceneId: z.string() }))
    .query(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({ where: { id: input.sceneId } });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireMember(ctx.db, scene.campaignId, ctx.session.user.id);
      return ctx.db.overlay.findMany({
        where: { sceneId: input.sceneId },
        orderBy: { createdAt: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        sceneId: z.string(),
        type: z.enum(["circle", "cone", "line", "square"]),
        color: z.string(),
        label: z.string().max(40).optional(),
        data: z.record(z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({ where: { id: input.sceneId } });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireMember(ctx.db, scene.campaignId, ctx.session.user.id);
      const overlay = await ctx.db.overlay.create({
        data: {
          sceneId: input.sceneId,
          userId: ctx.session.user.id,
          type: input.type,
          color: input.color,
          label: input.label ?? null,
          data: input.data as Prisma.InputJsonValue,
        },
      });
      emitToRoom(rooms.scene(input.sceneId), "scene:changed");
      return overlay;
    }),

  delete: protectedProcedure
    .input(z.object({ overlayId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const overlay = await ctx.db.overlay.findUnique({ where: { id: input.overlayId } });
      if (!overlay) throw new TRPCError({ code: "NOT_FOUND" });
      const scene = await ctx.db.scene.findUnique({ where: { id: overlay.sceneId } });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireMember(ctx.db, scene.campaignId, ctx.session.user.id);

      // own overlay, or GM/co-GM can delete any
      const isGm = await isGmOrCoGm(ctx.db, scene.campaignId, ctx.session.user.id);
      if (overlay.userId !== ctx.session.user.id && !isGm) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.db.overlay.delete({ where: { id: input.overlayId } });
      emitToRoom(rooms.scene(overlay.sceneId), "scene:changed");
      return { deleted: true };
    }),
});
