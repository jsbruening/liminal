import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "../../../../generated/prisma";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireOwnedCharacter } from "~/server/api/permissions";
import { fetchDdbCharacter, mapDdbCharacter, parseCharacterId, DdbNotPublicError, type DdbCharacterSheet } from "~/server/ddb";

async function fetchAndMapDdb(ddbCharacterId: string): Promise<DdbCharacterSheet> {
  try {
    const raw = await fetchDdbCharacter(ddbCharacterId);
    return mapDdbCharacter(raw);
  } catch (err) {
    if (err instanceof DdbNotPublicError) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "This character isn't shared as Public on D&D Beyond. Set sharing to Public and try again.",
      });
    }
    console.error("DDB import failed:", err);
    throw new TRPCError({ code: "BAD_GATEWAY", message: "D&D Beyond import failed." });
  }
}

export const characterRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        tokenUrl: z.string().optional(),
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

  // Owner can always view; a GM can also view any character joined to one of
  // their campaigns (Character Management iteration 1 — sheet visibility).
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const character = await ctx.db.character.findUnique({
        where: { id: input.id },
        include: { campaigns: { include: { campaign: true } } },
      });
      if (!character) throw new TRPCError({ code: "NOT_FOUND" });
      const isOwner = character.ownerId === ctx.session.user.id;
      const isGmOfSharedCampaign = character.campaigns.some(
        (cc) => cc.campaign.gmId === ctx.session.user.id,
      );
      if (!isOwner && !isGmOfSharedCampaign) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return character;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        tokenUrl: z.string().optional(),
        notes: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await requireOwnedCharacter(ctx.db, id, ctx.session.user.id);
      return ctx.db.character.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireOwnedCharacter(ctx.db, input.id, ctx.session.user.id);
      return ctx.db.character.delete({ where: { id: input.id } });
    }),

  // Owner-only: paste a D&D Beyond character URL, fetch + map it, and store
  // the result. Overwrites Character.name to match the DDB character.
  importFromDdb: protectedProcedure
    .input(z.object({ id: z.string(), url: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireOwnedCharacter(ctx.db, input.id, ctx.session.user.id);

      let ddbCharacterId: string;
      try {
        ddbCharacterId = parseCharacterId(input.url);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
      }

      const sheet = await fetchAndMapDdb(ddbCharacterId);
      return ctx.db.character.update({
        where: { id: input.id },
        data: {
          ddbUrl: input.url,
          ddbCharacterId,
          ddbSheet: JSON.parse(JSON.stringify(sheet)) as object,
          ddbImportedAt: new Date(),
          name: sheet.name,
        },
      });
    }),

  // Owner-only: re-fetch using the already-stored ddbCharacterId, no URL
  // re-entry needed.
  resync: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const character = await requireOwnedCharacter(ctx.db, input.id, ctx.session.user.id);
      if (!character.ddbCharacterId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No linked D&D Beyond character." });
      }

      const sheet = await fetchAndMapDdb(character.ddbCharacterId);
      return ctx.db.character.update({
        where: { id: input.id },
        data: {
          ddbSheet: JSON.parse(JSON.stringify(sheet)) as object,
          ddbImportedAt: new Date(),
          name: sheet.name,
        },
      });
    }),

  // Owner-only: clear the D&D Beyond link entirely.
  unlinkDdb: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireOwnedCharacter(ctx.db, input.id, ctx.session.user.id);
      return ctx.db.character.update({
        where: { id: input.id },
        data: { ddbUrl: null, ddbCharacterId: null, ddbSheet: Prisma.JsonNull, ddbImportedAt: null },
      });
    }),
});
