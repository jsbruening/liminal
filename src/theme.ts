import { Inter, Instrument_Serif } from "next/font/google";
import { createTheme } from "@mui/material/styles";

export const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
// Instrument Serif only ships in regular weight (no bold) — headings lean
// on size/letter-spacing for emphasis instead of weight.
export const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
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
    h1: { fontFamily: "var(--font-serif), serif", fontWeight: 400 },
    h2: { fontFamily: "var(--font-serif), serif", fontWeight: 400 },
    h3: { fontFamily: "var(--font-serif), serif", fontWeight: 400 },
    h4: { fontFamily: "var(--font-serif), serif", fontWeight: 400 },
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
