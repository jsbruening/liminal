"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { DiscordSignInButton } from "~/app/_components/discord-signin-button";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/campaigns";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Incorrect email/password, or your account isn't approved yet.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <Stack spacing={0}>
      <Stack spacing={0.75} sx={{ mb: 4.5 }}>
        <Typography variant="h1" sx={{ fontSize: 42 }}>
          Welcome back.
        </Typography>
        <Typography sx={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>
          Sign in to continue to your campaigns.
        </Typography>
      </Stack>

      <DiscordSignInButton callbackUrl={callbackUrl} />

      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5 }}>
        <Box sx={{ flex: 1, height: "1px", bgcolor: "rgba(255,255,255,0.07)" }} />
        <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          or
        </Typography>
        <Box sx={{ flex: 1, height: "1px", bgcolor: "rgba(255,255,255,0.07)" }} />
      </Stack>

      <Stack
        component="form"
        onSubmit={handleSubmit}
        sx={{ bgcolor: "background.paper", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", p: "28px 28px 24px" }}
      >
        <Stack spacing={0.75} sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>Email</Typography>
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
        <Stack spacing={0.75} sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>Password</Typography>
          <TextField
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            fullWidth
            size="small"
          />
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Button type="submit" variant="contained" size="large" disabled={isSubmitting} fullWidth>
          Sign in
        </Button>
      </Stack>

      <Typography sx={{ mt: 2.25, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.38)" }}>
        Don&apos;t have an account?{" "}
        <Link href="/signup" style={{ color: "rgba(194,163,107,0.75)", fontWeight: 500 }}>
          Sign up
        </Link>
      </Typography>
    </Stack>
  );
}
