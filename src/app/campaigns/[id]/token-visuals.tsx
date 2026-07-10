import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

const TOKEN_PALETTE = [
  "#c2a36b", // brass
  "#6f8fc2", // slate blue
  "#c2708a", // rose
  "#5fb8a0", // teal
  "#9b7ec9", // violet
  "#d18a5c", // amber
  "#8fb46a", // sage
  "#5fa8c9", // sky
];

export function colorForKey(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TOKEN_PALETTE[hash % TOKEN_PALETTE.length]!;
}

export function initialsFor(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export interface StatBlock {
  name: string;
  size: string;
  type: string;
  alignment: string;
  armorClass: number | null;
  hitPoints: number | null;
  hitDice: string | null;
  speed: Record<string, string>;
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  senses: Record<string, string | number>;
  languages: string | null;
  challengeRating: number | null;
  xp: number | null;
  specialAbilities: { name: string; desc: string }[];
  actions: { name: string; desc: string }[];
  legendaryActions: { name: string; desc: string }[];
  reactions: { name: string; desc: string }[];
}

function mod(score: number) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : String(m);
}

export function StatBlockContent({ statBlock }: { statBlock: StatBlock }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.45)", mb: 2, fontStyle: "italic" }}>
        {statBlock.size} {statBlock.type}, {statBlock.alignment}
      </Typography>

      <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            AC
          </Typography>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{statBlock.armorClass ?? "—"}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            HP
          </Typography>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
            {statBlock.hitPoints ?? "—"}
            {statBlock.hitDice ? ` (${statBlock.hitDice})` : ""}
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Speed
          </Typography>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
            {Object.entries(statBlock.speed)
              .map(([k, v]) => `${k} ${v}`)
              .join(", ") || "—"}
          </Typography>
        </Box>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 0.5,
          mb: 2,
          p: 1.5,
          borderRadius: "6px",
          bgcolor: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {(["str", "dex", "con", "int", "wis", "cha"] as const).map((k) => (
          <Box key={k} sx={{ textAlign: "center" }}>
            <Typography sx={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {k}
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>
              {statBlock.abilities[k]}
            </Typography>
            <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              {mod(statBlock.abilities[k])}
            </Typography>
          </Box>
        ))}
      </Box>

      {statBlock.challengeRating != null && (
        <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.45)", mb: 2 }}>
          CR {statBlock.challengeRating} · {statBlock.xp ?? "?"} XP
          {statBlock.languages ? ` · ${statBlock.languages}` : ""}
        </Typography>
      )}

      {[
        { label: "Special Abilities", items: statBlock.specialAbilities },
        { label: "Actions", items: statBlock.actions },
        { label: "Legendary Actions", items: statBlock.legendaryActions },
        { label: "Reactions", items: statBlock.reactions },
      ]
        .filter((s) => s.items.length > 0)
        .map((section) => (
          <Box key={section.label} sx={{ mb: 2 }}>
            <Typography
              sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "primary.main", mb: 1 }}
            >
              {section.label}
            </Typography>
            {section.items.map((a) => (
              <Typography key={a.name} sx={{ fontSize: 12.5, mb: 0.75, lineHeight: 1.6 }}>
                <Box component="span" sx={{ fontWeight: 700 }}>{a.name}. </Box>
                {a.desc}
              </Typography>
            ))}
          </Box>
        ))}
    </Box>
  );
}

export function StatBlockDrawer({
  statBlock,
  onClose,
}: {
  statBlock: StatBlock | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      anchor="right"
      variant="persistent"
      open={!!statBlock}
      slotProps={{
        paper: {
          sx: {
            position: "fixed",
            top: 0,
            right: 0,
            height: "100vh",
            width: 360,
            bgcolor: "background.paper",
            borderLeft: "1px solid rgba(255,255,255,0.1)",
            overflowY: "auto",
          },
        },
      }}
    >
      {statBlock && (
        <Box sx={{ p: 3 }}>
          <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", mb: 0.25 }}>
            <Typography variant="h2" sx={{ fontSize: 22 }}>
              {statBlock.name}
            </Typography>
            <IconButton size="small" onClick={onClose} sx={{ mt: -0.5, mr: -1 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          <StatBlockContent statBlock={statBlock} />
        </Box>
      )}
    </Drawer>
  );
}
