"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuIcon from "@mui/icons-material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CasinoIcon from "@mui/icons-material/Casino";
import LockIcon from "@mui/icons-material/Lock";
import Tooltip from "@mui/material/Tooltip";

import { ChangePasswordDialog } from "~/app/_components/change-password-dialog";
import { DiceThemeDialog } from "~/app/_components/dice-theme-dialog";

const NAV_LINKS = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/characters", label: "Characters" },
];

export function AppNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [diceThemeOpen, setDiceThemeOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

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
      <Toolbar sx={{ height: 56, minHeight: 56, gap: 0, px: { xs: 2, sm: 4 } }}>
        <Box
          component={Link}
          href="/campaigns"
          sx={{ display: "flex", alignItems: "center", gap: 1, mr: { xs: "auto", sm: 4 }, textDecoration: "none" }}
        >
          <Image src="/logo-icon.png" alt="" width={30} height={27} priority />
          <Typography
            sx={{
              fontFamily: "var(--font-serif), serif",
              fontWeight: 400,
              fontSize: 20,
              color: "primary.main",
              letterSpacing: "0.02em",
              display: { xs: "none", sm: "block" },
            }}
          >
            Liminal
          </Typography>
        </Box>

        {isMobile ? (
          <>
            <IconButton
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              sx={{ color: "rgba(255,255,255,0.7)" }}
              aria-label="Open menu"
            >
              <MenuIcon />
            </IconButton>
            <Menu
              anchorEl={menuAnchor}
              open={!!menuAnchor}
              onClose={() => setMenuAnchor(null)}
              slotProps={{ paper: { sx: { minWidth: 180 } } }}
            >
              {navLinks.map((link) => (
                <MenuItem
                  key={link.href}
                  component={Link}
                  href={link.href}
                  selected={pathname.startsWith(link.href)}
                  onClick={() => setMenuAnchor(null)}
                >
                  {link.label}
                </MenuItem>
              ))}
              <Divider />
              <MenuItem disabled sx={{ fontSize: 13, opacity: "0.6 !important" }}>
                {session?.user?.name ?? session?.user?.email}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  setDiceThemeOpen(true);
                }}
              >
                Dice style
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  setChangePasswordOpen(true);
                }}
              >
                Change password
              </MenuItem>
              <MenuItem component={Link} href="/api/auth/signout" onClick={() => setMenuAnchor(null)}>
                Sign out
              </MenuItem>
            </Menu>
          </>
        ) : (
          <>
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
              <Tooltip title="Dice style">
                <IconButton
                  size="small"
                  onClick={() => setDiceThemeOpen(true)}
                  sx={{ color: "rgba(255,255,255,0.4)", "&:hover": { color: "rgba(255,255,255,0.72)" } }}
                  aria-label="Dice style"
                >
                  <CasinoIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Change password">
                <IconButton
                  size="small"
                  onClick={() => setChangePasswordOpen(true)}
                  sx={{ color: "rgba(255,255,255,0.4)", "&:hover": { color: "rgba(255,255,255,0.72)" } }}
                  aria-label="Change password"
                >
                  <LockIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
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
          </>
        )}
      </Toolbar>
      <DiceThemeDialog open={diceThemeOpen} onClose={() => setDiceThemeOpen(false)} />
      <ChangePasswordDialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </AppBar>
  );
}
