"use client";

import { useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { api } from "~/trpc/react";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const register = api.user.register.useMutation();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 3,
      }}
    >
      <Stack spacing={3} sx={{ width: "100%", maxWidth: 360 }}>
        <Typography variant="h3">Create an account</Typography>

        {register.isSuccess ? (
          <Alert severity="success">
            Account created. An admin needs to approve it before you can sign
            in.
          </Alert>
        ) : (
          <Stack
            component="form"
            spacing={2}
            onSubmit={(e) => {
              e.preventDefault();
              register.mutate({ name, email, password });
            }}
          >
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              helperText="At least 8 characters"
            />
            {register.error && (
              <Alert severity="error">{register.error.message}</Alert>
            )}
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={register.isPending}
            >
              Sign up
            </Button>
          </Stack>
        )}

        <Typography variant="body2" color="text.secondary">
          Already have an account? <Link href="/api/auth/signin">Sign in</Link>
        </Typography>
      </Stack>
    </Box>
  );
}
