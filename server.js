import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.argv.includes("--dev");
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => handle(req, res));

const io = new Server(httpServer, { path: "/socket.io" });

io.on("connection", (socket) => {
  socket.on("join", (room) => {
    if (typeof room === "string") socket.join(room);
  });
  socket.on("leave", (room) => {
    if (typeof room === "string") socket.leave(room);
  });
});

// Stable across the process lifetime (this file is never re-bundled/reloaded
// by Next's dev pipeline) — read from here by src/server/socket.ts so tRPC
// routers can emit room events after a mutation.
globalThis.__liminalIO = io;

httpServer.listen(port, () => {
  console.log(`> Liminal ready on http://localhost:${port}${dev ? " (dev)" : ""}`);
});
