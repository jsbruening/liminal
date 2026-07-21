"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { api } from "~/trpc/react";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const resetPassword = api.user.resetPasswordWithToken.useMutation();

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  if (!token) {
    return (
      <Stack spacing={2}>
        <Typography variant="h1" sx={{ fontSize: 32 }}>
          Invalid link
        </Typography>
        <Typography sx={{ fontSize: 14, color: "rgba(255,255,255,0.45)" }}>
          This reset link is missing its token. Ask an admin to send you a new one.
        </Typography>
      </Stack>
    );
  }

  if (resetPassword.isSuccess) {
    return (
      <Stack spacing={2}>
        <Typography variant="h1" sx={{ fontSize: 32 }}>
          Password updated
        </Typography>
        <Alert severity="success">You can sign in with your new password now.</Alert>
        <Link href="/signin" style={{ color: "rgba(194,163,107,0.75)", fontWeight: 500, fontSize: 14 }}>
          Go to sign in
        </Link>
      </Stack>
    );
  }

  return (
    <Stack spacing={0}>
      <Stack spacing={0.75} sx={{ mb: 4.5 }}>
        <Typography variant="h1" sx={{ fontSize: 32 }}>
          Set a new password
        </Typography>
      </Stack>

      <Stack
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          resetPassword.mutate({ token, newPassword });
        }}
        sx={{
          bgcolor: "background.paper",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "8px",
          p: "28px 28px 24px",
        }}
      >
        <TextField
          type="password"
          label="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          fullWidth
          size="small"
          helperText="At least 8 characters"
          sx={{ mb: 2 }}
        />
        <TextField
          type="password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          fullWidth
          size="small"
          error={mismatch}
          helperText={mismatch ? "Passwords don't match" : " "}
          sx={{ mb: 1 }}
        />
        {resetPassword.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {resetPassword.error.message}
          </Alert>
        )}
        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          disabled={!newPassword || newPassword.length < 8 || mismatch || resetPassword.isPending}
        >
          Set password
        </Button>
      </Stack>
    </Stack>
  );
}
