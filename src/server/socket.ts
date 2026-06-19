import type { Server as IOServer } from "socket.io";

declare global {
  var __liminalIO: IOServer | undefined;
}

// Broadcasts a lightweight "something changed" signal to a room — never the
// changed data itself. Token visibility and fog are viewer-specific (see
// requireMember/isVisible filtering in the token/scene routers), so clients
// re-fetch through their own authenticated tRPC query rather than receiving
// a server-pushed payload that could leak hidden-token or fog info to a
// viewer who shouldn't see it.
export function emitToRoom(room: string, event: string) {
  globalThis.__liminalIO?.to(room).emit(event);
}

export const rooms = {
  scene: (sceneId: string) => `scene:${sceneId}`,
  campaign: (campaignId: string) => `campaign:${campaignId}`,
};
