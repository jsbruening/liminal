import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const characterRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        tokenUrl: z.string().url().optional(),
        notes: z.string().max(5000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.character.create({
        data: { ...input, ownerId: ctx.session.user.id },
      }),
    ),

  listMine: protectedProcedure.query(({ ctx }) =>
    ctx.db.character.findMany({
      where: { ownerId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
    }),
  ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        tokenUrl: z.string().url().optional(),
        notes: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const character = await ctx.db.character.findUnique({ where: { id } });
      if (!character || character.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.db.character.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const character = await ctx.db.character.findUnique({
        where: { id: input.id },
      });
      if (!character || character.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.db.character.delete({ where: { id: input.id } });
    }),
});
