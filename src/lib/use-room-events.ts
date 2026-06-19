"use client";

import { useEffect } from "react";

import { getSocket } from "~/lib/socket";

// Joins `room` for the lifetime of the component and calls `onEvent` every
// time the server emits `event` to it (see src/server/socket.ts — events
// carry no payload, they're just a "go refetch" signal).
export function useRoomEvents(
  room: string | undefined,
  event: string,
  onEvent: () => void,
) {
  useEffect(() => {
    if (!room) return;
    const socket = getSocket();
    socket.emit("join", room);
    socket.on(event, onEvent);
    return () => {
      socket.off(event, onEvent);
      socket.emit("leave", room);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, event]);
}
