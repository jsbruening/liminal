import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { isValidDiceTheme } from "~/lib/dice-themes";
import { hashResetToken } from "~/server/reset-token";

export const userRouter = createTRPCRouter({
  // Self-service. currentPassword is required unless the account has no
  // password yet (OAuth-only sign-up setting a password for the first time).
  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(8).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: ctx.session.user.id },
        select: { passwordHash: true },
      });

      if (user.passwordHash) {
        const matches = input.currentPassword && (await bcrypt.compare(input.currentPassword, user.passwordHash));
        if (!matches) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect." });
        }
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await ctx.db.user.update({ where: { id: ctx.session.user.id }, data: { passwordHash } });
      return { changed: true };
    }),

  // Public: consumes an admin-generated reset link (see admin.generatePasswordResetLink).
  resetPasswordWithToken: publicProcedure
    .input(z.object({ token: z.string(), newPassword: z.string().min(8).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const tokenHash = hashResetToken(input.token);
      const resetToken = await ctx.db.passwordResetToken.findUnique({ where: { tokenHash } });

      if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This reset link is invalid or has expired." });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await ctx.db.$transaction([
        ctx.db.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
        ctx.db.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
      ]);

      return { reset: true };
    }),

  getDiceTheme: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: { diceTheme: true },
    });
    return user.diceTheme;
  }),

  setDiceTheme: protectedProcedure
    .input(z.object({ theme: z.string().refine(isValidDiceTheme, "Unknown dice theme") }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { diceTheme: input.theme },
      });
      return { theme: input.theme };
    }),

  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        email: z.string().email(),
        password: z.string().min(8).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({
        where: { email: input.email },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with that email already exists.",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);

      await ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
        },
      });

      return { status: "PENDING" as const };
    }),
});
