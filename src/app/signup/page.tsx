"use client";

import { useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { AuthShell } from "~/app/_components/auth-shell";
import { DiscordSignInButton } from "~/app/_components/discord-signin-button";
import { api } from "~/trpc/react";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const register = api.user.register.useMutation();

  return (
    <AuthShell>
      <Stack spacing={0}>
        {register.isSuccess ? (
          <Alert severity="success">
            Account created. An admin needs to approve it before you can sign in.
          </Alert>
        ) : (
          <>
            <Stack spacing={0.75} sx={{ mb: 4.5 }}>
              <Typography variant="h1" sx={{ fontSize: 42 }}>
                Create account
              </Typography>
              <Typography sx={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>
                Request access to your campaign group.
              </Typography>
            </Stack>

            <DiscordSignInButton />

            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5 }}>
              <Box sx={{ flex: 1, height: "1px", bgcolor: "rgba(255,255,255,0.07)" }} />
              <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                or
              </Typography>
              <Box sx={{ flex: 1, height: "1px", bgcolor: "rgba(255,255,255,0.07)" }} />
            </Stack>

            <Stack
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                register.mutate({ name, email, password });
              }}
              sx={{ bgcolor: "background.paper", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", p: "28px 28px 24px" }}
            >
              <Stack spacing={0.75} sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
                  Full name
                </Typography>
                <TextField
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  fullWidth
                  size="small"
                />
              </Stack>

              <Stack spacing={0.75} sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
                  Email
                </Typography>
                <TextField
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  fullWidth
                  size="small"
                />
              </Stack>

              <Stack spacing={0.75} sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
                  Password
                </Typography>
                <TextField
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  fullWidth
                  size="small"
                  helperText="At least 8 characters"
                />
              </Stack>

              <Box
                sx={{
                  bgcolor: "rgba(194,163,107,0.07)",
                  border: "1px solid rgba(194,163,107,0.15)",
                  borderRadius: "6px",
                  p: "10px 12px",
                  mb: 2.5,
                }}
              >
                <Typography sx={{ fontSize: 12, color: "rgba(194,163,107,0.75)", lineHeight: 1.55 }}>
                  New accounts require admin approval before sign-in.
                </Typography>
              </Box>

              {register.error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {register.error.message}
                </Alert>
              )}

              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={register.isPending}
              >
                Request access
              </Button>
            </Stack>

            <Typography sx={{ mt: 2.25, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.38)" }}>
              Already have an account?{" "}
              <Link href="/signin" style={{ color: "rgba(194,163,107,0.75)", fontWeight: 500 }}>
                Sign in
              </Link>
            </Typography>
          </>
        )}
      </Stack>
    </AuthShell>
  );
}
