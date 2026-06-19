"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | undefined;

// Singleton client connection — every hook/component shares one socket
// rather than opening a new connection per mounted component.
export function getSocket() {
  socket ??= io({ path: "/socket.io" });
  return socket;
}
