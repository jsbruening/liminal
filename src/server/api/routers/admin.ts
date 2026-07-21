import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { generateResetToken } from "~/server/reset-token";

export const adminRouter = createTRPCRouter({
  // Generates a one-time password reset link. Returns the raw token once —
  // only its hash is persisted. No email is sent; the admin copies the link
  // themselves and shares it however they like (Slack, email, in person).
  generatePasswordResetLink: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      // Invalidate any previous unused links for this user so only the
      // newest one works.
      await ctx.db.passwordResetToken.deleteMany({ where: { userId: input.userId, usedAt: null } });

      const { token, tokenHash, expiresAt } = generateResetToken();
      await ctx.db.passwordResetToken.create({
        data: { userId: input.userId, tokenHash, expiresAt },
      });

      return { token };
    }),

  // Every account, for the admin/GM management screen — not just PENDING.
  listAllUsers: adminProcedure.query(({ ctx }) =>
    ctx.db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, status: true, isAdmin: true, createdAt: true },
    }),
  ),

  setAdmin: adminProcedure
    .input(z.object({ userId: z.string(), isAdmin: z.boolean() }))
    .mutation(({ ctx, input }) => {
      if (input.userId === ctx.session.user.id && !input.isAdmin) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't remove your own admin access." });
      }
      return ctx.db.user.update({
        where: { id: input.userId },
        data: { isAdmin: input.isAdmin },
      });
    }),

  listPendingUsers: adminProcedure.query(({ ctx }) =>
    ctx.db.user.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, createdAt: true },
    }),
  ),

  approveUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: input.userId },
        data: {
          status: "APPROVED",
          approvedById: ctx.session.user.id,
          approvedAt: new Date(),
        },
      }),
    ),

  rejectUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: input.userId },
        data: {
          status: "REJECTED",
          approvedById: ctx.session.user.id,
          approvedAt: new Date(),
        },
      }),
    ),
});
