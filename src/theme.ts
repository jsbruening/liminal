import { Inter, Cormorant_Garamond } from "next/font/google";
import { createTheme } from "@mui/material/styles";

export const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
export const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-serif",
});

// Liminal: a quiet, sophisticated palette — charcoal/ink ground, a single
// restrained accent (muted brass/amber). Deliberately avoids "fantasy app"
// cliches (parchment textures, bold reds, ornate borders, dice iconography).
const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#13151a",
      paper: "#1b1e25",
    },
    primary: {
      main: "#c2a36b",
      light: "#d4ba8c",
      dark: "#9c8252",
      contrastText: "#13151a",
    },
    secondary: {
      main: "#7c8a9e",
    },
    divider: "rgba(255,255,255,0.08)",
    text: {
      primary: "rgba(255,255,255,0.92)",
      secondary: "rgba(255,255,255,0.62)",
    },
  },
  typography: {
    fontFamily: "var(--font-sans), system-ui, sans-serif",
    h1: { fontFamily: "var(--font-serif), serif", fontWeight: 600 },
    h2: { fontFamily: "var(--font-serif), serif", fontWeight: 600 },
    h3: { fontFamily: "var(--font-serif), serif", fontWeight: 600 },
    h4: { fontFamily: "var(--font-serif), serif", fontWeight: 600 },
    button: { fontWeight: 500, textTransform: "none" },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiAppBar: {
      defaultProps: { color: "transparent", elevation: 0 },
      styleOverrides: {
        root: {
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        },
      },
    },
  },
});

export default theme;
