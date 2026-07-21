import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { canControlToken, requireGm, requireMember } from "~/server/api/permissions";
import { emitToRoom, rooms } from "~/server/socket";
import { type db as Db } from "~/server/db";

const FEET_PER_CELL = 5;

function visibleCells(centerX: number, centerY: number, sightFt: number) {
  const radius = sightFt / FEET_PER_CELL;
  const cells: { x: number; y: number }[] = [];
  const r = Math.ceil(radius);
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      if (dx * dx + dy * dy <= radius * radius) {
        cells.push({ x: centerX + dx, y: centerY + dy });
      }
    }
  }
  return cells;
}

// Merges newly-visible cells into a character's persisted fog state for a
// scene (token-vision based fog of war — see schema.prisma SceneFogReveal).
async function revealCellsForCharacter(
  db: typeof Db,
  sceneId: string,
  characterId: string,
  newCells: { x: number; y: number }[],
  updatedById: string,
) {
  const existing = await db.sceneFogReveal.findUnique({
    where: { sceneId_characterId: { sceneId, characterId } },
  });
  const existingCells = (existing?.revealedCells as { x: number; y: number }[]) ?? [];
  const seen = new Set(existingCells.map((c) => `${c.x},${c.y}`));
  for (const c of newCells) {
    seen.add(`${c.x},${c.y}`);
  }
  const merged = Array.from(seen, (key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });

  await db.sceneFogReveal.upsert({
    where: { sceneId_characterId: { sceneId, characterId } },
    update: { revealedCells: merged, updatedById },
    create: { sceneId, characterId, revealedCells: merged, updatedById },
  });
}

export const tokenRouter = createTRPCRouter({
  // GM-only: place a new token on a scene.
  create: protectedProcedure
    .input(
      z.object({
        sceneId: z.string(),
        characterId: z.string().optional(),
        npcTemplateId: z.string().optional(),
        label: z.string().max(100).optional(),
        imageUrl: z.string().optional(),
        gridX: z.number().int(),
        gridY: z.number().int(),
        size: z
          .enum(["TINY", "SMALL", "MEDIUM", "LARGE", "HUGE", "GIGANTIC"])
          .default("MEDIUM"),
        sightFt: z.number().int().min(0).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({
        where: { id: input.sceneId },
      });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, scene.campaignId, ctx.session.user.id);

      if (input.npcTemplateId) {
        const template = await ctx.db.npcTemplate.findUnique({
          where: { id: input.npcTemplateId },
        });
        if (template?.campaignId !== scene.campaignId) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
      }

      const token = await ctx.db.token.create({ data: input });

      if (input.characterId && input.sightFt > 0) {
        await revealCellsForCharacter(
          ctx.db,
          input.sceneId,
          input.characterId,
          visibleCells(input.gridX, input.gridY, input.sightFt),
          ctx.session.user.id,
        );
      }

      emitToRoom(rooms.scene(input.sceneId), "scene:changed");
      return token;
    }),

  listForScene: protectedProcedure
    .input(z.object({ sceneId: z.string() }))
    .query(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({
        where: { id: input.sceneId },
      });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      const { isGm } = await requireMember(
        ctx.db,
        scene.campaignId,
        ctx.session.user.id,
      );

      return ctx.db.token.findMany({
        where: { sceneId: input.sceneId, ...(isGm ? {} : { isVisible: true }) },
        include: { character: true, npcTemplate: true, controllers: true },
      });
    }),

  // Fog state visible to the calling user for this scene: GMs always see
  // everything; everyone else sees the union of what their own characters
  // have revealed (or the whole map, if the GM has lifted fog for the scene).
  getFogForViewer: protectedProcedure
    .input(z.object({ sceneId: z.string() }))
    .query(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({
        where: { id: input.sceneId },
      });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      const { isGm } = await requireMember(
        ctx.db,
        scene.campaignId,
        ctx.session.user.id,
      );

      if (isGm || scene.fogLifted) {
        return { fogLifted: true, revealedCells: [] as { x: number; y: number }[] };
      }

      const reveals = await ctx.db.sceneFogReveal.findMany({
        where: {
          sceneId: input.sceneId,
          character: { ownerId: ctx.session.user.id },
        },
      });

      const seen = new Set<string>();
      const revealedCells: { x: number; y: number }[] = [];
      for (const reveal of reveals) {
        for (const c of reveal.revealedCells as { x: number; y: number }[]) {
          const key = `${c.x},${c.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            revealedCells.push(c);
          }
        }
      }

      return { fogLifted: false, revealedCells };
    }),

  move: protectedProcedure
    .input(z.object({ tokenId: z.string(), gridX: z.number().int(), gridY: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { token, allowed } = await canControlToken(
        ctx.db,
        input.tokenId,
        ctx.session.user.id,
      );
      if (!token || !allowed) throw new TRPCError({ code: "FORBIDDEN" });

      const updated = await ctx.db.token.update({
        where: { id: input.tokenId },
        data: { gridX: input.gridX, gridY: input.gridY },
      });

      if (token.characterId && token.sightFt > 0) {
        await revealCellsForCharacter(
          ctx.db,
          token.sceneId,
          token.characterId,
          visibleCells(input.gridX, input.gridY, token.sightFt),
          ctx.session.user.id,
        );
      }

      emitToRoom(rooms.scene(token.sceneId), "scene:changed");
      return updated;
    }),

  delegateControl: protectedProcedure
    .input(z.object({ tokenId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { token, allowed } = await canControlToken(
        ctx.db,
        input.tokenId,
        ctx.session.user.id,
      );
      if (!token || !allowed) throw new TRPCError({ code: "FORBIDDEN" });

      const result = await ctx.db.tokenController.upsert({
        where: {
          tokenId_controlledById: { tokenId: input.tokenId, controlledById: input.userId },
        },
        update: {},
        create: { tokenId: input.tokenId, controlledById: input.userId },
      });
      emitToRoom(rooms.scene(token.sceneId), "scene:changed");
      return result;
    }),

  revokeControl: protectedProcedure
    .input(z.object({ tokenId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { token, allowed } = await canControlToken(
        ctx.db,
        input.tokenId,
        ctx.session.user.id,
      );
      if (!token || !allowed) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db.tokenController.deleteMany({
        where: { tokenId: input.tokenId, controlledById: input.userId },
      });
      emitToRoom(rooms.scene(token.sceneId), "scene:changed");
      return { revoked: true };
    }),

  setConditions: protectedProcedure
    .input(z.object({ tokenId: z.string(), conditions: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const token = await ctx.db.token.findUnique({
        where: { id: input.tokenId },
        include: { scene: true },
      });
      if (!token) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, token.scene.campaignId, ctx.session.user.id);
      const updated = await ctx.db.token.update({
        where: { id: input.tokenId },
        data: { conditions: input.conditions },
      });
      emitToRoom(rooms.scene(token.sceneId), "scene:changed");
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ tokenId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const token = await ctx.db.token.findUnique({
        where: { id: input.tokenId },
        include: { scene: true },
      });
      if (!token) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, token.scene.campaignId, ctx.session.user.id);

      const deleted = await ctx.db.token.delete({ where: { id: input.tokenId } });
      emitToRoom(rooms.scene(token.sceneId), "scene:changed");
      return deleted;
    }),

  // GM-only: peek at the fog state from a specific perspective without
  // changing what players see. viewAs = "party" for the union of all
  // characters' revealed cells, or a characterId for a single character.
  getFogAsGm: protectedProcedure
    .input(z.object({ sceneId: z.string(), viewAs: z.string() }))
    .query(async ({ ctx, input }) => {
      const scene = await ctx.db.scene.findUnique({ where: { id: input.sceneId } });
      if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
      await requireGm(ctx.db, scene.campaignId, ctx.session.user.id);

      const merge = (rows: { revealedCells: unknown }[]) => {
        const seen = new Set<string>();
        const cells: { x: number; y: number }[] = [];
        for (const row of rows) {
          for (const c of row.revealedCells as { x: number; y: number }[]) {
            const k = `${c.x},${c.y}`;
            if (!seen.has(k)) { seen.add(k); cells.push(c); }
          }
        }
        return cells;
      };

      if (input.viewAs === "party") {
        const rows = await ctx.db.sceneFogReveal.findMany({ where: { sceneId: input.sceneId } });
        return { fogLifted: false, revealedCells: merge(rows) };
      }

      const row = await ctx.db.sceneFogReveal.findUnique({
        where: { sceneId_characterId: { sceneId: input.sceneId, characterId: input.viewAs } },
      });
      return { fogLifted: false, revealedCells: merge(row ? [row] : []) };
    }),
});
