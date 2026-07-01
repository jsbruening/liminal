"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

const NAV_LINKS = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/characters", label: "Characters" },
];

export function AppNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const navLinks = session?.user?.isAdmin
    ? [...NAV_LINKS, { href: "/admin/users", label: "Admin" }]
    : NAV_LINKS;

  return (
    <AppBar
      position="sticky"
      sx={{
        height: 56,
        backgroundColor: "rgba(27,30,37,0.85)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Toolbar sx={{ height: 56, minHeight: 56, gap: 0, px: 4 }}>
        <Box
          component={Link}
          href="/campaigns"
          sx={{ display: "flex", alignItems: "center", gap: 1, mr: 4, textDecoration: "none" }}
        >
          <Image src="/logo-icon.png" alt="" width={30} height={27} priority />
          <Typography
            sx={{
              fontFamily: "var(--font-serif), serif",
              fontWeight: 400,
              fontSize: 20,
              color: "primary.main",
              letterSpacing: "0.02em",
            }}
          >
            Liminal
          </Typography>
        </Box>

        <Box component="nav" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {navLinks.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Box
                key={link.href}
                component={Link}
                href={link.href}
                sx={{
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                  padding: "5px 10px",
                  borderRadius: "6px",
                  color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.42)",
                  backgroundColor: active ? "rgba(255,255,255,0.07)" : "transparent",
                  "&:hover": active
                    ? undefined
                    : { color: "rgba(255,255,255,0.72)", backgroundColor: "rgba(255,255,255,0.04)" },
                }}
              >
                {link.label}
              </Box>
            );
          })}
        </Box>

        <Box sx={{ flex: 1 }} />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.75 }}>
          <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            {session?.user?.name ?? session?.user?.email}
          </Typography>
          <Box
            component={Link}
            href="/api/auth/signout"
            sx={{
              fontSize: 13,
              color: "rgba(255,255,255,0.3)",
              textDecoration: "none",
              "&:hover": { color: "rgba(255,255,255,0.62)" },
            }}
          >
            Sign out
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
