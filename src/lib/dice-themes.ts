// Curated subset of @3d-dice/dice-themes: only themes that ship a full
// standard polyhedral set (d4/d6/d8/d10/d10%/d12/d20). Excludes addon/variant
// packs (default-extras, diceOfRolling-fate, smooth-pip) and non-numeric
// systems (genesys, genesys2) that wouldn't render sensible D&D results.
export type DiceThemeOption = {
  id: string;
  label: string;
  description: string;
  thumbnail: string;
};

export const DICE_THEME_OPTIONS: DiceThemeOption[] = [
  {
    id: "blueGreenMetal",
    label: "Blue-Green Metal",
    description: "Blue green rustic metal skin",
    thumbnail: "/assets/dice-box/themes/blueGreenMetal/diffuse.jpg",
  },
  {
    id: "default",
    label: "Default",
    description: "Default skin",
    thumbnail: "/assets/dice-box/themes/default/diffuse-dark.png",
  },
  {
    id: "diceOfRolling",
    label: "Dice of Rolling",
    description: "Multicolored dice skin based on Dice of Rolling",
    thumbnail: "/assets/dice-box/themes/diceOfRolling/diffuse.jpg",
  },
  {
    id: "gemstone",
    label: "Gemstone",
    description: "Gemstone dice with configurable colors",
    thumbnail: "/assets/dice-box/themes/gemstone/gemstone-dark.png",
  },
  {
    id: "gemstoneMarble",
    label: "Gemstone Marble",
    description: "Gemstone dice with a multicolored marble skin",
    thumbnail: "/assets/dice-box/themes/gemstoneMarble/diffuse.jpg",
  },
  {
    id: "rock",
    label: "Rock",
    description: "Rock textured theme with configurable colors",
    thumbnail: "/assets/dice-box/themes/rock/diffuse-dark.png",
  },
  {
    id: "rust",
    label: "Rust",
    description: "Rust textured theme with configurable colors",
    thumbnail: "/assets/dice-box/themes/rust/diffuse-dark.png",
  },
  {
    id: "smooth",
    label: "Smooth",
    description: "Smooth edged dice with configurable colors",
    thumbnail: "/assets/dice-box/themes/smooth/diffuse-dark.png",
  },
  {
    id: "wooden",
    label: "Wooden",
    description: "Wooden dice skin",
    thumbnail: "/assets/dice-box/themes/wooden/diffuse.jpg",
  },
];

export const DEFAULT_DICE_THEME = "blueGreenMetal";

export function isValidDiceTheme(id: string): boolean {
  return DICE_THEME_OPTIONS.some((t) => t.id === id);
}
