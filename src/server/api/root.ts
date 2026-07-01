import { adminRouter } from "~/server/api/routers/admin";
import { campaignRouter } from "~/server/api/routers/campaign";
import { characterRouter } from "~/server/api/routers/character";
import { healthRouter } from "~/server/api/routers/health";
import { npcTemplateRouter } from "~/server/api/routers/npcTemplate";
import { sceneRouter } from "~/server/api/routers/scene";
import { tokenRouter } from "~/server/api/routers/token";
import { userRouter } from "~/server/api/routers/user";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  user: userRouter,
  admin: adminRouter,
  campaign: campaignRouter,
  character: characterRouter,
  scene: sceneRouter,
  token: tokenRouter,
  npcTemplate: npcTemplateRouter,
});

// export type definition of AppRouter
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 */
export const createCaller = createCallerFactory(appRouter);
