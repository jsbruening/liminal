"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type DiceBox from "@3d-dice/dice-box";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { api } from "~/trpc/react";
import type { DdbCharacterSheet } from "~/server/ddb";

export const DICE_SIZES = [4, 6, 8, 10, 12, 20] as const;
type DieSize = (typeof DICE_SIZES)[number];

export type RollCategory = {
  type: "skill" | "save" | "attack" | "spellAttack" | "spellDamage" | "free";
  sourceName: string;
};

export type DiceRollEntry = {
  id: string;
  name: string;
  notation: string;
  result: number;
  modifier: number;
  category: RollCategory;
};

export interface RollableCharacter {
  id: string;
  name: string;
  ddbSheet: unknown;
}

const CONTAINER_ID = "liminal-dice-box";
const SHOW_MS = 3500;

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
// crash the whole page; the fix for the player is to hit Re-sync.
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

const sectionHeaderSx = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "primary.main",
  mt: 1,
  mb: 0.5,
};

const rollRowSx = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  py: 0.4,
  cursor: "pointer",
  borderRadius: "4px",
  px: 0.5,
  "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
};

interface Props {
  sceneId: string;
  rolls: DiceRollEntry[];
  characters: RollableCharacter[];
}

export function DiceRoller({ sceneId, rolls, characters }: Props) {
  const [counts, setCounts] = useState<Counts>(zeroCounts());
  const [modifier, setModifier] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [rollResult, setRollResult] = useState<{
    notation: string;
    total: number;
    modifier: number;
    isCritNat20: boolean;
    isNat1: boolean;
  } | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const diceBoxRef = useRef<DiceBox | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingModRef = useRef(0);

  const rollDice = api.scene.rollDice.useMutation();

  const charactersWithSheet = characters.filter((c) => c.ddbSheet != null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const selectedCharacter =
    charactersWithSheet.find((c) => c.id === selectedCharacterId) ?? charactersWithSheet[0] ?? null;
  const sheet = normalizeSheet(selectedCharacter?.ddbSheet);

  const [tab, setTab] = useState<"sheet" | "free">("sheet");

  useEffect(() => {
    setPortalTarget(document.body);

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.style.cssText = `position:fixed;top:0;left:0;width:${window.innerWidth}px;height:${window.innerHeight}px;z-index:1100;pointer-events:none;`;
    document.body.appendChild(container);

    let active = true;

    // Keep the dice overlay's container (and canvas) in sync with the real
    // viewport size. A single window.innerWidth/innerHeight read at mount is
    // unreliable on iOS Safari, whose chrome (URL bar) collapses/expands
    // after first paint. Dispatching a "resize" event afterward also nudges
    // DiceBox's own internal resize listener, which re-syncs its renderer to
    // canvas.clientWidth/clientHeight.
    function syncContainerSize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      container.style.width = `${w}px`;
      container.style.height = `${h}px`;
      const canvas = container.querySelector("canvas");
      if (canvas instanceof HTMLCanvasElement) {
        canvas.width = w;
        canvas.height = h;
      }
      window.dispatchEvent(new Event("resize"));
    }

    const resizeObserver = new ResizeObserver(() => syncContainerSize());
    resizeObserver.observe(document.documentElement);

    void (async () => {
      try {
        const { default: DiceBox } = await import("@3d-dice/dice-box");
        if (!active) return;

        const box = new DiceBox({
          container: `#${CONTAINER_ID}`,
          assetPath: "/assets/dice-box/",
          origin: window.location.origin,
          theme: "blueGreenMetal",
          scale: 5,
          gravity: 1,
          mass: 1,
          friction: 0.8,
          restitution: 0,
          angularDamping: 0.4,
          linearDamping: 0.4,
          spinForce: 6,
          throwForce: 4,
          startingHeight: 8,
          settleTimeout: 6000,
          offscreen: false,
          delay: 10,
          enableShadows: true,
          shadowTransparency: 0.8,
          lightIntensity: 1,
        });

        await box.init();
        if (!active) return;

        syncContainerSize();
        const canvas = container.querySelector("canvas");
        if (canvas instanceof HTMLElement) canvas.style.pointerEvents = "none";

        diceBoxRef.current = box;
      } catch (err) {
        console.error("DiceBox init failed:", err);
      }
    })();

    return () => {
      active = false;
      resizeObserver.disconnect();
      if (document.body.contains(container)) document.body.removeChild(container);
    };
  }, []);

  function increment(die: DieSize) {
    setCounts((c) => ({ ...c, [die]: Math.min(c[die] + 1, 9) }));
  }

  function decrement(die: DieSize) {
    setCounts((c) => ({ ...c, [die]: Math.max(c[die] - 1, 0) }));
  }

  // Core roll pipeline, shared by the free-form tray and every sheet-driven
  // roll button. rollGroups is an array of dice-box group strings (e.g.
  // ["1d20"] or ["2d6","1d20"] for the free tray's multi-die-type case —
  // dice-box requires an array, not a joined string, for mixed rolls).
  async function performRoll(rollGroups: string[], mod: number, category: RollCategory) {
    const box = diceBoxRef.current;
    if (rolling || !box || rollGroups.length === 0) return;

    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    box.clear();
    setRolling(true);
    setRollResult(null);
    pendingModRef.current = mod;

    const notation = rollGroups.join("+");

    try {
      const results = await box.roll(rollGroups);
      if (!results?.length) {
        setRolling(false);
        return;
      }

      const m = pendingModRef.current;
      const diceTotal = results.reduce((s, r) => s + r.value, 0);
      const total = diceTotal + m;
      const isCritNat20 = results.length === 1 && results[0]?.sides === 20 && results[0]?.value === 20;
      const isNat1 = results.length === 1 && results[0]?.sides === 20 && results[0]?.value === 1;

      setRollResult({ notation, total, modifier: m, isCritNat20, isNat1 });
      setRolling(false);
      rollDice.mutate({ sceneId, notation, result: total, modifier: m, category });

      clearTimerRef.current = setTimeout(() => {
        box.clear();
        setRollResult(null);
      }, SHOW_MS);
    } catch {
      setRolling(false);
    }
  }

  function handleFreeRoll() {
    const rollGroups = DICE_SIZES.filter((d) => counts[d] > 0).map((d) => `${counts[d]}d${d}`);
    if (rollGroups.length === 0) return;
    const mod = modifier;
    setCounts(zeroCounts());
    void performRoll(rollGroups, mod, { type: "free", sourceName: "Free Roll" });
  }

  function signed(n: number) {
    return n >= 0 ? `+${n}` : String(n);
  }

  const freeNotation = buildNotation(counts);
  const totalDice = totalDiceCount(counts);
  const canRoll = totalDice > 0 && !rolling;

  const labelColor = rollResult?.isCritNat20
    ? "#c2a36b"
    : rollResult?.isNat1
      ? "#ef5350"
      : "white";

  const labelText = rollResult
    ? rollResult.isCritNat20
      ? "NATURAL 20!"
      : rollResult.isNat1
        ? "NAT 1"
        : rollResult.modifier !== 0
          ? `${rollResult.notation} + ${rollResult.modifier} = ${rollResult.total}`
          : `${rollResult.notation}: ${rollResult.total}`
    : "";

  return (
    <>
      {/* Result label — portaled to body to escape Stage's CSS transform */}
      {portalTarget &&
        rollResult &&
        createPortal(
          <Box
            sx={{
              position: "fixed",
              bottom: "22vh",
              left: "50%",
              zIndex: 1200,
              pointerEvents: "none",
              "@keyframes diceResultIn": {
                "0%": { opacity: 0, transform: "translateX(-50%) translateY(10px)" },
                "100%": { opacity: 1, transform: "translateX(-50%) translateY(0)" },
              },
              animation: "diceResultIn 0.28s ease-out",
              transform: "translateX(-50%)",
            }}
          >
            <Box
              sx={{
                bgcolor: "rgba(8,9,11,0.93)",
                border: `1px solid ${rollResult.isCritNat20 ? "#c2a36b" : rollResult.isNat1 ? "#ef5350" : "rgba(255,255,255,0.15)"}`,
                borderRadius: "8px",
                px: 3,
                py: 1,
                boxShadow: rollResult.isCritNat20
                  ? "0 0 28px rgba(194,163,107,0.4)"
                  : rollResult.isNat1
                    ? "0 0 20px rgba(239,83,80,0.4)"
                    : "0 4px 20px rgba(0,0,0,0.6)",
              }}
            >
              <Typography sx={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.06em", color: labelColor }}>
                {labelText}
              </Typography>
            </Box>
          </Box>,
          portalTarget,
        )}

      {/* Dice panel */}
      <Box
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        sx={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 10,
          bgcolor: "rgba(10,11,13,0.84)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "10px",
          p: 1.25,
          backdropFilter: "blur(10px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          minWidth: 264,
          maxWidth: 300,
        }}
      >
        {/* Roll log */}
        {rolls.length > 0 && (
          <Box
            sx={{
              mb: 1,
              maxHeight: 130,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              "&::-webkit-scrollbar": { width: 4 },
              "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
              "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(255,255,255,0.12)", borderRadius: 2 },
            }}
          >
            {[...rolls].reverse().map((roll) => {
              const total = roll.result;
              const entryColor =
                roll.notation === "1d20" && total === 20
                  ? "#c2a36b"
                  : roll.notation === "1d20" && total === 1
                    ? "#ef5350"
                    : "rgba(255,255,255,0.82)";
              return (
                <Box
                  key={roll.id}
                  sx={{
                    py: 0.35,
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    "&:last-child": { borderBottom: "none" },
                  }}
                >
                  <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.36)", lineHeight: 1.2 }} noWrap>
                    {roll.name}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: entryColor, lineHeight: 1.35 }}>
                    {roll.category.sourceName}
                    {" → "}
                    <span style={{ fontSize: 14 }}>{total}</span>
                    <Box component="span" sx={{ fontSize: 10, color: "rgba(255,255,255,0.35)", ml: 0.5 }}>
                      ({roll.notation}
                      {roll.modifier !== 0 ? (roll.modifier > 0 ? ` +${roll.modifier}` : ` ${roll.modifier}`) : ""})
                    </Box>
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}

        {/* Sheet / Free tabs — only shown if the player has a linked character */}
        {charactersWithSheet.length > 0 && (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 0.75 }}>
              {(["sheet", "free"] as const).map((t) => (
                <Box
                  key={t}
                  onClick={() => setTab(t)}
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    px: 1,
                    py: 0.25,
                    borderRadius: "4px",
                    color: tab === t ? "rgba(140,210,190,0.95)" : "rgba(255,255,255,0.4)",
                    bgcolor: tab === t ? "rgba(100,180,160,0.12)" : "transparent",
                    "&:hover": { color: "rgba(140,210,190,0.9)" },
                  }}
                >
                  {t === "sheet" ? "Sheet" : "Free"}
                </Box>
              ))}
              {tab === "sheet" && charactersWithSheet.length > 1 && (
                <Box
                  component="select"
                  value={selectedCharacter?.id}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCharacterId(e.target.value)}
                  sx={{
                    ml: "auto",
                    fontSize: 10,
                    bgcolor: "transparent",
                    color: "rgba(255,255,255,0.6)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "4px",
                  }}
                >
                  {charactersWithSheet.map((c) => (
                    <option key={c.id} value={c.id} style={{ background: "#13151a" }}>
                      {c.name}
                    </option>
                  ))}
                </Box>
              )}
            </Stack>

            {tab === "sheet" && sheet && (
              <Box sx={{ maxHeight: 220, overflowY: "auto", mb: 1 }}>
                <Typography sx={sectionHeaderSx}>Saves</Typography>
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
                      <Typography sx={{ fontSize: 12 }}>{ability.toUpperCase()} Save</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: "rgba(140,210,190,0.9)" }}>
                        {signed(save.modifier)}
                      </Typography>
                    </Box>
                  ),
                )}

                <Typography sx={sectionHeaderSx}>Skills</Typography>
                {sheet.skills.map((s) => (
                  <Box
                    key={s.name}
                    sx={rollRowSx}
                    onClick={() => void performRoll(["1d20"], s.modifier, { type: "skill", sourceName: s.name })}
                  >
                    <Typography sx={{ fontSize: 12 }}>{s.name}</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: "rgba(140,210,190,0.9)" }}>
                      {signed(s.modifier)}
                    </Typography>
                  </Box>
                ))}

                {sheet.attacks.length > 0 && (
                  <>
                    <Typography sx={sectionHeaderSx}>Attacks</Typography>
                    {sheet.attacks.map((a, i) => (
                      <Box key={`${a.name}-${i}`} sx={{ py: 0.25 }}>
                        <Typography sx={{ fontSize: 12, mb: 0.25 }}>{a.name}</Typography>
                        <Stack direction="row" spacing={1}>
                          {a.toHit != null && (
                            <Box
                              sx={{ ...rollRowSx, flex: 1 }}
                              onClick={() =>
                                void performRoll(["1d20"], a.toHit!, { type: "attack", sourceName: `${a.name} — Attack` })
                              }
                            >
                              <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                                Attack {signed(a.toHit)}
                              </Typography>
                            </Box>
                          )}
                          {a.damage && (
                            <Box
                              sx={{ ...rollRowSx, flex: 1 }}
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
                  </>
                )}

                {sheet.spells.length > 0 && (
                  <>
                    <Typography sx={sectionHeaderSx}>Spells</Typography>
                    {sheet.spells.map((sp) => (
                      <Box key={sp.name} sx={{ py: 0.25 }}>
                        <Typography sx={{ fontSize: 12, mb: 0.25 }}>{sp.name}</Typography>
                        {(sp.attackRoll || sp.damageRoll) && (
                          <Stack direction="row" spacing={1}>
                            {sp.attackRoll && sheet.spellAttackBonus != null && (
                              <Box
                                sx={{ ...rollRowSx, flex: 1 }}
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
                                sx={{ ...rollRowSx, flex: 1 }}
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
                  </>
                )}
              </Box>
            )}
          </>
        )}

        {/* Free-form tray — always available; the only UI shown if no linked character */}
        {(tab === "free" || charactersWithSheet.length === 0) && (
          <>
            <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
              {DICE_SIZES.map((sides) => {
                const count = counts[sides];
                const active = count > 0;
                return (
                  <Tooltip key={sides} title={`Tap to add d${sides}`} placement="top">
                    <Box
                      onClick={() => increment(sides)}
                      sx={{
                        position: "relative",
                        width: 34,
                        height: 34,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "7px",
                        border: `1px solid ${active ? "rgba(100,180,160,0.7)" : "rgba(255,255,255,0.14)"}`,
                        bgcolor: active ? "rgba(100,180,160,0.12)" : "transparent",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 700,
                        color: active ? "rgba(140,210,190,0.95)" : "rgba(255,255,255,0.55)",
                        userSelect: "none",
                        transition: "all 0.1s",
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
                            top: -5,
                            right: -5,
                            width: 14,
                            height: 14,
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
                            bottom: -6,
                            right: -6,
                            width: 16,
                            height: 16,
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
                          −
                        </Box>
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
            </Stack>

            {/* Modifier + Roll */}
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              {/* Modifier stepper */}
              <Stack direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
                <Box
                  onClick={() => setModifier((m) => m - 1)}
                  sx={{
                    width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "4px", border: "1px solid rgba(255,255,255,0.12)",
                    cursor: "pointer", fontSize: 14, lineHeight: 1, color: "rgba(255,255,255,0.4)",
                    "&:hover": { color: "white" },
                  }}
                >
                  −
                </Box>
                <Typography
                  sx={{
                    fontSize: 11, fontWeight: 700, minWidth: 26, textAlign: "center",
                    color: modifier !== 0 ? "rgba(140,210,190,0.9)" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {modifier >= 0 ? `+${modifier}` : modifier}
                </Typography>
                <Box
                  onClick={() => setModifier((m) => m + 1)}
                  sx={{
                    width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "4px", border: "1px solid rgba(255,255,255,0.12)",
                    cursor: "pointer", fontSize: 14, lineHeight: 1, color: "rgba(255,255,255,0.4)",
                    "&:hover": { color: "white" },
                  }}
                >
                  +
                </Box>
              </Stack>

              {/* Roll button */}
              <Box
                onClick={canRoll ? handleFreeRoll : undefined}
                sx={{
                  flex: 1,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                  border: `1px solid ${canRoll ? "rgba(100,180,160,0.6)" : "rgba(255,255,255,0.08)"}`,
                  bgcolor: canRoll ? "rgba(100,180,160,0.15)" : "rgba(255,255,255,0.04)",
                  cursor: canRoll ? "pointer" : "default",
                  transition: "all 0.1s",
                  "&:hover": canRoll ? { bgcolor: "rgba(100,180,160,0.22)", borderColor: "rgba(100,180,160,0.8)" } : {},
                }}
              >
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: canRoll ? "rgba(140,210,190,0.95)" : "rgba(255,255,255,0.2)",
                    letterSpacing: "0.04em",
                    userSelect: "none",
                  }}
                >
                  {rolling ? "Rolling…" : canRoll ? `Roll ${freeNotation}` : "Roll"}
                </Typography>
              </Box>
            </Stack>
          </>
        )}
      </Box>
    </>
  );
}
