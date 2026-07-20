import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { DdbCharacterSheet } from "~/server/ddb";

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

function signed(n: number) {
  return n >= 0 ? `+${n}` : String(n);
}

const labelSx = {
  fontSize: 10,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

const panelSx = {
  borderRadius: "6px",
  bgcolor: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
};

function ProficiencyDot({ proficient, expertise }: { proficient: boolean; expertise: boolean }) {
  return (
    <Box
      sx={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        flexShrink: 0,
        bgcolor: expertise || proficient ? "primary.main" : "transparent",
        border: `1.5px solid ${expertise || proficient ? "primary.main" : "rgba(255,255,255,0.25)"}`,
        boxShadow: expertise ? "0 0 0 2px rgba(194,163,107,0.35)" : "none",
      }}
    />
  );
}

export function CharacterSheet({ sheet }: { sheet: DdbCharacterSheet }) {
  return (
    <Box>
      <Typography variant="h2" sx={{ fontSize: 22, mb: 0.25 }}>
        {sheet.name}
      </Typography>
      <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.45)", mb: 2, fontStyle: "italic" }}>
        {sheet.race} · {sheet.classes.map((c) => `${c.name} ${c.level}`).join(" / ")}
        {sheet.background ? ` · ${sheet.background}` : ""}
      </Typography>

      <Stack direction="row" spacing={3} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1.5 }}>
        {[
          { label: "AC", value: sheet.armorClass },
          {
            label: "HP",
            value: `${sheet.hitPoints.current}/${sheet.hitPoints.max}${sheet.hitPoints.temp ? ` (+${sheet.hitPoints.temp})` : ""}`,
          },
          { label: "Speed", value: `${sheet.speed} ft` },
          { label: "Initiative", value: signed(sheet.initiative) },
          { label: "Prof. Bonus", value: signed(sheet.proficiencyBonus) },
          { label: "Passive Perception", value: sheet.passivePerception },
        ].map((s) => (
          <Box key={s.label}>
            <Typography sx={labelSx}>{s.label}</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{s.value}</Typography>
          </Box>
        ))}
      </Stack>

      <Box
        sx={{
          ...panelSx,
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 1,
          p: 1.5,
          mb: 2,
        }}
      >
        {ABILITY_KEYS.map((k) => (
          <Box key={k} sx={{ textAlign: "center" }}>
            <Typography sx={{ ...labelSx, fontSize: 9 }}>{k}</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>
              {sheet.abilities[k].score}
            </Typography>
            <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              {signed(sheet.abilities[k].modifier)}
            </Typography>
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ mt: 0.5, alignItems: "center", justifyContent: "center" }}
            >
              <ProficiencyDot proficient={sheet.savingThrows[k].proficient} expertise={false} />
              <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                save {signed(sheet.savingThrows[k].modifier)}
              </Typography>
            </Stack>
          </Box>
        ))}
      </Box>

      <Typography
        sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "primary.main", mb: 1 }}
      >
        Skills
      </Typography>
      <Box
        sx={{
          ...panelSx,
          p: 1.5,
          mb: 2,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "6px 16px",
        }}
      >
        {sheet.skills.map((s) => (
          <Stack key={s.name} direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <ProficiencyDot proficient={s.proficient} expertise={s.expertise} />
            <Typography sx={{ fontSize: 12.5, flex: 1 }}>{s.name}</Typography>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
              {signed(s.modifier)}
            </Typography>
          </Stack>
        ))}
      </Box>

      {sheet.attacks.length > 0 && (
        <>
          <Typography
            sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "primary.main", mb: 1 }}
          >
            Attacks
          </Typography>
          <Box sx={{ ...panelSx, p: 1.5 }}>
            {sheet.attacks.map((a, i) => (
              <Typography key={`${a.name}-${i}`} sx={{ fontSize: 12.5, mb: 0.5, lineHeight: 1.6 }}>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {a.name}
                </Box>
                {a.toHit != null ? ` · to hit ${signed(a.toHit)}` : ""}
                {a.damage ? ` · ${a.damage}` : ""}
              </Typography>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
