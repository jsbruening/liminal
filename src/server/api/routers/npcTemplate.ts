import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { requireGm } from "~/server/api/permissions";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { importSrdMonster, searchSrdMonsters } from "~/server/srd";

export const npcTemplateRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);
      return ctx.db.npcTemplate.findMany({
        where: { campaignId: input.campaignId },
        orderBy: { createdAt: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        name: z.string().min(1).max(100),
        sightFt: z.number().int().min(0).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);
      return ctx.db.npcTemplate.create({
        data: { campaignId: input.campaignId, name: input.name, sightFt: input.sightFt },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        avatarUrl: z.string().optional(),
        sightFt: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const template = await ctx.db.npcTemplate.findUnique({ where: { id } });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, template.campaignId, ctx.session.user.id);
      return ctx.db.npcTemplate.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.db.npcTemplate.findUnique({ where: { id: input.id } });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, template.campaignId, ctx.session.user.id);
      return ctx.db.npcTemplate.delete({ where: { id: input.id } });
    }),

  // GM-only: search the public D&D 5e SRD for monsters by name (free, no
  // auth — see src/server/srd.ts for licensing notes).
  searchSrd: protectedProcedure
    .input(z.object({ campaignId: z.string(), query: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);
      try {
        return await searchSrdMonsters(input.query);
      } catch (err) {
        console.error("SRD search failed:", err);
        throw new TRPCError({ code: "BAD_GATEWAY", message: "SRD lookup failed." });
      }
    }),

  importFromSrd: protectedProcedure
    .input(z.object({ campaignId: z.string(), index: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireGm(ctx.db, input.campaignId, ctx.session.user.id);
      let imported;
      try {
        imported = await importSrdMonster(input.index);
      } catch (err) {
        console.error("SRD import failed:", err);
        throw new TRPCError({ code: "BAD_GATEWAY", message: "SRD import failed." });
      }
      return ctx.db.npcTemplate.create({
        data: {
          campaignId: input.campaignId,
          name: imported.statBlock.name,
          avatarUrl: imported.avatarUrl,
          sightFt: imported.sightFt,
          source: `SRD: ${imported.statBlock.name}`,
          statBlock: JSON.parse(JSON.stringify(imported.statBlock)) as object,
        },
      });
    }),
});
