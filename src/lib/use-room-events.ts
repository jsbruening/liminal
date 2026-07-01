"use client";

import { useEffect } from "react";

import { getSocket } from "~/lib/socket";

// Joins `room` for the lifetime of the component and calls `onEvent` every
// time the server emits `event` to it. Most events carry no payload (see
// src/server/socket.ts — they're just a "go refetch" signal); a few
// deliberate exceptions (e.g. pings) do, hence the optional generic.
export function useRoomEvents<T = void>(
  room: string | undefined,
  event: string,
  onEvent: (payload: T) => void,
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
