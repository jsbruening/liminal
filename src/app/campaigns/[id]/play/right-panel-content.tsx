"use client";
import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CasinoOutlinedIcon from "@mui/icons-material/CasinoOutlined";
import CasinoIcon from "@mui/icons-material/Casino";

import type { DdbCharacterSheet } from "~/server/ddb";
import { DiceThemeDialog } from "~/app/_components/dice-theme-dialog";
import { useDiceEngine, type DiceRollEntry, type RollCategory } from "./use-dice-engine";

export const DICE_SIZES = [4, 6, 8, 10, 12, 20] as const;
type DieSize = (typeof DICE_SIZES)[number];
type Counts = Record<DieSize, number>;
const zeroCounts = (): Counts => ({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0 });

function buildNotation(counts: Counts): string {
  return DICE_SIZES.filter((d) => counts[d] > 0)
    .map((d) => `${counts[d]}d${d}`)
    .join("+");
}

function totalDiceCount(counts: Counts) {
  return DICE_SIZES.reduce((s, d) => s + counts[d], 0);
}

// Parses damage-dice display strings produced by ddb.ts's computeAttacks
// ("1d6 +4" style) and open5e.ts's damage_roll/higherLevelDamage (plain
// "8d6", no modifier) into a rollable dice group + flat modifier.
function parseDamageDice(damage: string): { notation: string; modifier: number } {
  const match = /^(\d+d\d+)\s*([+-]\s*\d+)?$/.exec(damage.trim());
  if (!match?.[1]) return { notation: damage.trim(), modifier: 0 };
  return { notation: match[1], modifier: match[2] ? Number(match[2].replace(/\s+/g, "")) : 0 };
}

// A stored ddbSheet is a JSON snapshot from whenever the character was last
// imported/re-synced — a character imported before spell support shipped
// has no spells/spellSlots/spellcastingAbility fields at all until the
// player re-syncs. Default the newer fields so an old snapshot doesn't
// crash the panel.
function normalizeSheet(raw: unknown): DdbCharacterSheet | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as DdbCharacterSheet;
  return {
    ...s,
    attacks: s.attacks ?? [],
    spells: s.spells ?? [],
    spellSlots: s.spellSlots ?? [],
    spellcastingAbility: s.spellcastingAbility ?? null,
    spellSaveDc: s.spellSaveDc ?? null,
    spellAttackBonus: s.spellAttackBonus ?? null,
  };
}

export interface RollableCharacter {
  id: string;
  name: string;
  ddbSheet: unknown;
}

function signed(n: number) {
  return n >= 0 ? `+${n}` : String(n);
}

const labelSx = {
  fontSize: 10,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

const rollRowSx = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  py: 0.5,
  px: 0.75,
  cursor: "pointer",
  borderRadius: "4px",
  "&:hover": { bgcolor: "rgba(140,210,190,0.07)" },
};

const accordionSx = {
  bgcolor: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "6px !important",
  mb: 1,
  "&:before": { display: "none" },
};

const CATEGORY_ICONS: Record<RollCategory["type"], typeof ShieldOutlinedIcon> = {
  save: ShieldOutlinedIcon,
  skill: TrackChangesOutlinedIcon,
  attack: GavelOutlinedIcon,
  spellAttack: AutoAwesomeOutlinedIcon,
  spellDamage: AutoAwesomeOutlinedIcon,
  free: CasinoOutlinedIcon,
};

const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"] as const;

type PanelTab = "sheet" | "dice" | "log";

interface Props {
  rolls: DiceRollEntry[];
  characters: RollableCharacter[];
  // Uncontrolled by default (desktop docked column manages its own tab and
  // shows its own tab strip). Pass both to let an external control — e.g.
  // the mobile bottom bar — drive which tab is showing instead, and set
  // hideTabs so this component doesn't render a second, redundant strip.
  tab?: PanelTab;
  onTabChange?: (tab: PanelTab) => void;
  hideTabs?: boolean;
}

export function RightPanelContent({ rolls, characters, tab: controlledTab, onTabChange, hideTabs }: Props) {
  const { performRoll, rolling } = useDiceEngine();
  const [internalTab, setInternalTab] = useState<PanelTab>("sheet");
  const tab = controlledTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;

  const charactersWithSheet = characters.filter((c) => c.ddbSheet != null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const selectedCharacter =
    charactersWithSheet.find((c) => c.id === selectedCharacterId) ?? charactersWithSheet[0] ?? null;
  const sheet = normalizeSheet(selectedCharacter?.ddbSheet);

  const [skillFilter, setSkillFilter] = useState("");

  const [counts, setCounts] = useState<Counts>(zeroCounts());
  const [modifier, setModifier] = useState(0);
  const [diceThemeOpen, setDiceThemeOpen] = useState(false);

  function increment(die: DieSize) {
    setCounts((c) => ({ ...c, [die]: Math.min(c[die] + 1, 9) }));
  }
  function decrement(die: DieSize) {
    setCounts((c) => ({ ...c, [die]: Math.max(c[die] - 1, 0) }));
  }

  function handleFreeRoll() {
    const rollGroups = DICE_SIZES.filter((d) => counts[d] > 0).map((d) => `${counts[d]}d${d}`);
    if (rollGroups.length === 0) return;
    const mod = modifier;
    setCounts(zeroCounts());
    void performRoll(rollGroups, mod, { type: "free", sourceName: "Free Roll" });
  }

  const freeNotation = buildNotation(counts);
  const totalDice = totalDiceCount(counts);
  const canRoll = totalDice > 0 && !rolling;

  const skillsByAbility = sheet
    ? ABILITY_ORDER.map((ability) => ({
        ability,
        skills: sheet.skills.filter(
          (s) => s.ability === ability && s.name.toLowerCase().includes(skillFilter.trim().toLowerCase()),
        ),
      })).filter((g) => g.skills.length > 0)
    : [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {!hideTabs && (
      <Stack direction="row" sx={{ borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        {(["sheet", "dice", "log"] as const).map((t) => (
          <Box
            key={t}
            onClick={() => setTab(t)}
            sx={{
              flex: 1,
              textAlign: "center",
              py: 1.25,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderBottom: `2px solid ${tab === t ? "#c2a36b" : "transparent"}`,
              color: tab === t ? "#c2a36b" : "rgba(255,255,255,0.4)",
              "&:hover": { color: tab === t ? "#c2a36b" : "rgba(255,255,255,0.6)" },
            }}
          >
            {t === "sheet" ? "Sheet" : t === "dice" ? "Dice" : "Log"}
          </Box>
        ))}
      </Stack>
      )}

      <Box sx={{ flex: 1, overflowY: "auto", p: 1.5 }}>
        {tab === "sheet" &&
          (sheet ? (
            <Box>
              {charactersWithSheet.length > 1 && (
                <Box
                  component="select"
                  value={selectedCharacter?.id}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCharacterId(e.target.value)}
                  sx={{
                    mb: 1.5,
                    fontSize: 11,
                    bgcolor: "transparent",
                    color: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "4px",
                    px: 1,
                    py: 0.5,
                  }}
                >
                  {charactersWithSheet.map((c) => (
                    <option key={c.id} value={c.id} style={{ background: "#13151a" }}>
                      {c.name}
                    </option>
                  ))}
                </Box>
              )}
              <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 0.25 }}>{sheet.name}</Typography>
              <Typography sx={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", mb: 1.5 }}>
                {sheet.race} &middot; {sheet.classes.map((c) => `${c.name} ${c.level}`).join(" / ")}
              </Typography>

              <Accordion disableGutters defaultExpanded sx={accordionSx}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }} />}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <ShieldOutlinedIcon sx={{ fontSize: 15, color: "primary.main" }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                      Saves
                    </Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  {(Object.entries(sheet.savingThrows) as [string, { modifier: number; proficient: boolean }][]).map(
                    ([ability, save]) => (
                      <Box
                        key={ability}
                        sx={rollRowSx}
                        onClick={() =>
                          void performRoll(["1d20"], save.modifier, {
                            type: "save",
                            sourceName: `${ability.toUpperCase()} Save`,
                          })
                        }
                      >
                        <Typography sx={{ fontSize: 12.5 }}>{ability.toUpperCase()} Save</Typography>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "rgba(140,210,190,0.9)" }}>
                          {signed(save.modifier)}
                        </Typography>
                      </Box>
                    ),
                  )}
                </AccordionDetails>
              </Accordion>

              <Accordion disableGutters defaultExpanded sx={accordionSx}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }} />}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <TrackChangesOutlinedIcon sx={{ fontSize: 15, color: "primary.main" }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                      Skills
                    </Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <TextField
                    size="small"
                    placeholder="Filter skills…"
                    value={skillFilter}
                    onChange={(e) => setSkillFilter(e.target.value)}
                    fullWidth
                    sx={{
                      mb: 1,
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                      "& .MuiOutlinedInput-input": { fontSize: 12, py: 0.75 },
                    }}
                  />
                  {skillsByAbility.map((group) => (
                    <Box key={group.ability}>
                      <Typography sx={{ ...labelSx, fontSize: 9, px: 0.75, pt: 0.5 }}>{group.ability}</Typography>
                      {group.skills.map((s) => (
                        <Box
                          key={s.name}
                          sx={rollRowSx}
                          onClick={() =>
                            void performRoll(["1d20"], s.modifier, { type: "skill", sourceName: s.name })
                          }
                        >
                          <Typography sx={{ fontSize: 12.5 }}>{s.name}</Typography>
                          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "rgba(140,210,190,0.9)" }}>
                            {signed(s.modifier)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ))}
                </AccordionDetails>
              </Accordion>

              {sheet.attacks.length > 0 && (
                <Accordion disableGutters sx={accordionSx}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }} />}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <GavelOutlinedIcon sx={{ fontSize: 15, color: "primary.main" }} />
                      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                        Attacks
                      </Typography>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    {sheet.attacks.map((a, i) => (
                      <Box key={`${a.name}-${i}`} sx={{ py: 0.5 }}>
                        <Typography sx={{ fontSize: 12.5, mb: 0.5 }}>{a.name}</Typography>
                        <Stack direction="row" spacing={1}>
                          {a.toHit != null && (
                            <Box
                              sx={{ ...rollRowSx, flex: 1, border: "1px solid rgba(255,255,255,0.1)" }}
                              onClick={() =>
                                void performRoll(["1d20"], a.toHit!, {
                                  type: "attack",
                                  sourceName: `${a.name} — Attack`,
                                })
                              }
                            >
                              <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                                Attack {signed(a.toHit)}
                              </Typography>
                            </Box>
                          )}
                          {a.damage && (
                            <Box
                              sx={{ ...rollRowSx, flex: 1, border: "1px solid rgba(255,255,255,0.1)" }}
                              onClick={() => {
                                const { notation, modifier: dmgMod } = parseDamageDice(a.damage!);
                                void performRoll([notation], dmgMod, {
                                  type: "attack",
                                  sourceName: `${a.name} — Damage`,
                                });
                              }}
                            >
                              <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                                Dmg {a.damage}
                              </Typography>
                            </Box>
                          )}
                        </Stack>
                      </Box>
                    ))}
                  </AccordionDetails>
                </Accordion>
              )}

              {sheet.spells.length > 0 && (
                <Accordion disableGutters sx={accordionSx}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }} />}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <AutoAwesomeOutlinedIcon sx={{ fontSize: 15, color: "primary.main" }} />
                      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                        Spells
                      </Typography>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    {sheet.spells.map((sp) => (
                      <Box key={sp.name} sx={{ py: 0.5 }}>
                        <Typography sx={{ fontSize: 12.5, mb: 0.5 }}>{sp.name}</Typography>
                        {(sp.attackRoll || sp.damageRoll) && (
                          <Stack direction="row" spacing={1}>
                            {sp.attackRoll && sheet.spellAttackBonus != null && (
                              <Box
                                sx={{ ...rollRowSx, flex: 1, border: "1px solid rgba(255,255,255,0.1)" }}
                                onClick={() =>
                                  void performRoll(["1d20"], sheet.spellAttackBonus!, {
                                    type: "spellAttack",
                                    sourceName: `${sp.name} — Attack`,
                                  })
                                }
                              >
                                <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                                  Attack {signed(sheet.spellAttackBonus)}
                                </Typography>
                              </Box>
                            )}
                            {sp.damageRoll && (
                              <Box
                                sx={{ ...rollRowSx, flex: 1, border: "1px solid rgba(255,255,255,0.1)" }}
                                onClick={() => {
                                  const { notation, modifier: dmgMod } = parseDamageDice(sp.damageRoll!);
                                  void performRoll([notation], dmgMod, {
                                    type: "spellDamage",
                                    sourceName: `${sp.name} — Damage`,
                                  });
                                }}
                              >
                                <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                                  Dmg {sp.damageRoll}
                                </Typography>
                              </Box>
                            )}
                          </Stack>
                        )}
                      </Box>
                    ))}
                  </AccordionDetails>
                </Accordion>
              )}
            </Box>
          ) : (
            <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
              No linked character yet — import one from your character page to roll straight from a sheet here.
            </Typography>
          ))}

        {tab === "dice" && (
          <Box>
            <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 1 }}>
              <Box
                onClick={() => setDiceThemeOpen(true)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  cursor: "pointer",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.4)",
                  "&:hover": { color: "rgba(255,255,255,0.75)" },
                }}
              >
                <CasinoIcon sx={{ fontSize: 14 }} />
                Dice style
              </Box>
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.5 }}>
              {DICE_SIZES.map((sides) => {
                const count = counts[sides];
                const active = count > 0;
                return (
                  <Box
                    key={sides}
                    onClick={() => increment(sides)}
                    sx={{
                      position: "relative",
                      width: 40,
                      height: 40,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "8px",
                      border: `1px solid ${active ? "rgba(100,180,160,0.7)" : "rgba(255,255,255,0.14)"}`,
                      bgcolor: active ? "rgba(100,180,160,0.12)" : "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                      color: active ? "rgba(140,210,190,0.95)" : "rgba(255,255,255,0.55)",
                      userSelect: "none",
                      "&:hover": {
                        borderColor: "rgba(100,180,160,0.6)",
                        color: "rgba(140,210,190,0.9)",
                        bgcolor: "rgba(100,180,160,0.08)",
                      },
                    }}
                  >
                    d{sides}
                    {count > 1 && (
                      <Box
                        sx={{
                          position: "absolute",
                          top: -6,
                          right: -6,
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          bgcolor: "rgba(100,180,160,0.9)",
                          color: "#0a0b0d",
                          fontSize: 9,
                          fontWeight: 800,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          lineHeight: 1,
                        }}
                      >
                        {count}
                      </Box>
                    )}
                    {active && (
                      <Box
                        onClick={(e) => {
                          e.stopPropagation();
                          decrement(sides);
                        }}
                        sx={{
                          position: "absolute",
                          bottom: -7,
                          right: -7,
                          width: 17,
                          height: 17,
                          borderRadius: "50%",
                          bgcolor: "rgba(30,32,36,0.95)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 800,
                          lineHeight: 1,
                          color: "rgba(255,255,255,0.7)",
                          "&:hover": { color: "white", borderColor: "rgba(255,255,255,0.4)" },
                        }}
                      >
                        &minus;
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Stack>

            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Stack direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
                <Box
                  onClick={() => setModifier((m) => m - 1)}
                  sx={{
                    width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "4px", border: "1px solid rgba(255,255,255,0.12)",
                    cursor: "pointer", fontSize: 14, lineHeight: 1, color: "rgba(255,255,255,0.4)",
                    "&:hover": { color: "white" },
                  }}
                >
                  &minus;
                </Box>
                <Typography
                  sx={{
                    fontSize: 12, fontWeight: 700, minWidth: 28, textAlign: "center",
                    color: modifier !== 0 ? "rgba(140,210,190,0.9)" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {modifier >= 0 ? `+${modifier}` : modifier}
                </Typography>
                <Box
                  onClick={() => setModifier((m) => m + 1)}
                  sx={{
                    width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "4px", border: "1px solid rgba(255,255,255,0.12)",
                    cursor: "pointer", fontSize: 14, lineHeight: 1, color: "rgba(255,255,255,0.4)",
                    "&:hover": { color: "white" },
                  }}
                >
                  +
                </Box>
              </Stack>

              <Box
                onClick={canRoll ? handleFreeRoll : undefined}
                sx={{
                  flex: 1,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                  border: `1px solid ${canRoll ? "rgba(100,180,160,0.6)" : "rgba(255,255,255,0.08)"}`,
                  bgcolor: canRoll ? "rgba(100,180,160,0.15)" : "rgba(255,255,255,0.04)",
                  cursor: canRoll ? "pointer" : "default",
                  "&:hover": canRoll ? { bgcolor: "rgba(100,180,160,0.22)", borderColor: "rgba(100,180,160,0.8)" } : {},
                }}
              >
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: canRoll ? "rgba(140,210,190,0.95)" : "rgba(255,255,255,0.2)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {rolling ? "Rolling…" : canRoll ? `Roll ${freeNotation}` : "Roll"}
                </Typography>
              </Box>
            </Stack>
          </Box>
        )}

        {tab === "log" && (
          <Box>
            {rolls.length === 0 && (
              <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No rolls yet this scene.</Typography>
            )}
            {[...rolls].reverse().map((roll) => {
              const isCrit = roll.notation === "1d20" && roll.result === 20;
              const isFail = roll.notation === "1d20" && roll.result === 1;
              const Icon = CATEGORY_ICONS[roll.category.type];
              return (
                <Stack
                  key={roll.id}
                  direction="row"
                  spacing={1.25}
                  sx={{
                    py: 1,
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    borderLeft: `3px solid ${isCrit ? "#c2a36b" : isFail ? "#ef5350" : "transparent"}`,
                    pl: 1,
                    alignItems: "flex-start",
                  }}
                >
                  <Icon sx={{ fontSize: 16, color: "rgba(255,255,255,0.5)", mt: 0.25 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)" }} noWrap>
                      {roll.name}
                    </Typography>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 700 }} noWrap>
                      {roll.category.sourceName}
                    </Typography>
                    <Typography sx={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)" }}>
                      {roll.notation}
                      {roll.modifier !== 0 ? (roll.modifier > 0 ? ` +${roll.modifier}` : ` ${roll.modifier}`) : ""}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: isCrit ? "#c2a36b" : isFail ? "#ef5350" : "white",
                      flexShrink: 0,
                    }}
                  >
                    {roll.result}
                  </Typography>
                </Stack>
              );
            })}
          </Box>
        )}
      </Box>
      <DiceThemeDialog open={diceThemeOpen} onClose={() => setDiceThemeOpen(false)} />
    </Box>
  );
}
