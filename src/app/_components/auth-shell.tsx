import Image from "next/image";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Box sx={{ height: 56, display: "flex", alignItems: "center", px: 4, flexShrink: 0 }}>
        <Image src="/logo-icon.png" alt="" width={26} height={23} />
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

      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", px: 3, py: 5 }}>
        <Box sx={{ width: "100%", maxWidth: 400 }}>{children}</Box>
      </Box>

      <Box sx={{ py: 2.5, textAlign: "center", flexShrink: 0 }}>
        <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
          Self-hosted · Your data stays yours
        </Typography>
      </Box>
    </Box>
  );
}
