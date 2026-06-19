import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";

export const adminRouter = createTRPCRouter({
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
