import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { auth } from "~/server/auth";

export default async function Home() {
  const session = await auth();

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
      <Stack spacing={4} sx={{ alignItems: "center", textAlign: "center", maxWidth: 520 }}>
        <Typography variant="h1" sx={{ fontSize: { xs: 40, sm: 56 } }}>
          Liminal
        </Typography>
        <Typography variant="body1" color="text.secondary">
          A quiet, dependable virtual tabletop for your campaign.
        </Typography>

        {session?.user ? (
          <Stack spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Signed in as {session.user.name ?? session.user.email}
            </Typography>
            {session.user.isAdmin && (
              <Button component={Link} href="/admin/users" variant="text">
                Pending accounts
              </Button>
            )}
            <Button component={Link} href="/api/auth/signout" variant="outlined">
              Sign out
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" spacing={2}>
            <Button component={Link} href="/api/auth/signin" variant="contained" size="large">
              Sign in
            </Button>
            <Button component={Link} href="/signup" variant="outlined" size="large">
              Sign up
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
