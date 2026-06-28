"use client";

import { signIn } from "next-auth/react";
import Button from "@mui/material/Button";

// Wired and ready to go, but won't actually work until real Discord OAuth
// credentials are set in .env (AUTH_DISCORD_ID / AUTH_DISCORD_SECRET) —
// both are blank by default.
export function DiscordSignInButton({ callbackUrl }: { callbackUrl?: string }) {
  return (
    <Button
      onClick={() => signIn("discord", { callbackUrl })}
      fullWidth
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        bgcolor: "#404eed",
        color: "#fff",
        py: 1.375,
        mb: 1.5,
        "&:hover": { bgcolor: "#5865F2" },
      }}
    >
      <svg width="18" height="14" viewBox="0 0 71 55" fill="#fff" style={{ flexShrink: 0 }}>
        <path d="M60.1 4.9A58.6 58.6 0 0 0 45.6.9a40.9 40.9 0 0 0-1.8 3.7 54.2 54.2 0 0 0-16.2 0A39 39 0 0 0 25.8.9 58.5 58.5 0 0 0 11.2 5C1.6 19.4-1 33.4.3 47.3a59 59 0 0 0 18 9.1 44.8 44.8 0 0 0 3.9-6.3 38.4 38.4 0 0 1-6.1-2.9l1.5-1.1a42 42 0 0 0 35.9 0l1.5 1.1a38.4 38.4 0 0 1-6.1 2.9 44.8 44.8 0 0 0 3.9 6.3 58.8 58.8 0 0 0 18-9.1C72 31.2 68.1 17.3 60.1 4.9zM23.7 38.8c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.5 0 6.4 3.2 6.3 7.1 0 3.9-2.8 7.1-6.3 7.1zm23.6 0c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.5 0 6.4 3.2 6.3 7.1 0 3.9-2.8 7.1-6.3 7.1z" />
      </svg>
      Continue with Discord
    </Button>
  );
}
