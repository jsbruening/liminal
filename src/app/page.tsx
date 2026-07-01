import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { auth } from "~/server/auth";

const VALUE_PROPS = [
  {
    label: "Live sync",
    detail: "Every move, every roll, instantly on every screen at the table.",
  },
  {
    label: "Per-character fog",
    detail: "Each player sees only what their own character can see.",
  },
  {
    label: "Self-hosted",
    detail: "Runs on hardware you own. Your campaigns stay yours.",
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/campaigns");
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Box sx={{ height: 56, display: "flex", alignItems: "center", px: 4, flexShrink: 0 }}>
        <Image src="/logo-icon.png" alt="" width={26} height={23} priority />
        <Typography
          sx={{
            fontFamily: "var(--font-serif), serif",
            fontWeight: 400,
            fontSize: 20,
            color: "primary.main",
            letterSpacing: "0.02em",
            ml: 1,
          }}
        >
          Liminal
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          px: 3,
          py: 8,
        }}
      >
        <Box sx={{ position: "relative", width: 150, height: 135, mb: 3 }}>
          <Box
            sx={{
              position: "absolute",
              inset: "-40px",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(194,163,107,0.32), transparent 70%)",
              filter: "blur(18px)",
              animation: "portalGlow 4s ease-in-out infinite",
              "@keyframes portalGlow": {
                "0%, 100%": { opacity: 0.55 },
                "50%": { opacity: 1 },
              },
            }}
          />
          <Image
            src="/logo-icon.png"
            alt=""
            width={150}
            height={135}
            priority
            style={{
              position: "relative",
              filter: "drop-shadow(0 0 22px rgba(194,163,107,0.5))",
            }}
          />
        </Box>

        <Typography
          variant="h1"
          sx={{ fontSize: { xs: 44, sm: 64 }, lineHeight: 1.08, maxWidth: 640 }}
        >
          Step through.
          <br />
          Your table awaits.
        </Typography>
        <Typography
          sx={{
            mt: 2.5,
            fontSize: 17,
            color: "rgba(255,255,255,0.55)",
            maxWidth: 440,
          }}
        >
          A quiet, dependable virtual tabletop — live sync, per-character fog
          of war, and a home that&apos;s entirely your own.
        </Typography>

        <Stack direction="row" spacing={2} sx={{ mt: 4.5 }}>
          <Button component={Link} href="/signin" variant="contained" size="large">
            Sign in
          </Button>
          <Button component={Link} href="/signup" variant="outlined" size="large">
            Request access
          </Button>
        </Stack>
      </Box>

      <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.06)", py: 5, flexShrink: 0 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 3, sm: 8 }}
          sx={{ maxWidth: 760, mx: "auto", px: 3, justifyContent: "center" }}
        >
          {VALUE_PROPS.map((item) => (
            <Box
              key={item.label}
              sx={{ textAlign: { xs: "center", sm: "left" }, maxWidth: 220 }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "primary.main",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  mb: 0.5,
                }}
              >
                {item.label}
              </Typography>
              <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                {item.detail}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>

      <Box sx={{ py: 2.5, textAlign: "center", flexShrink: 0 }}>
        <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
          Self-hosted · Your data stays yours
        </Typography>
      </Box>
    </Box>
  );
}
