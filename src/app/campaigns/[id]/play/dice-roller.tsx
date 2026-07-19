"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type DiceBox from "@3d-dice/dice-box";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { api } from "~/trpc/react";

export const DICE_SIZES = [4, 6, 8, 10, 12, 20] as const;
type DieSize = (typeof DICE_SIZES)[number];

export type DiceRollEntry = {
  id: string;
  name: string;
  notation: string;
  result: number;
  modifier: number;
};

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

interface Props {
  sceneId: string;
  rolls: DiceRollEntry[];
}

export function DiceRoller({ sceneId, rolls }: Props) {
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

  async function handleRoll() {
    const box = diceBoxRef.current;
    const notation = buildNotation(counts);
    if (rolling || !box || !notation) return;

    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    box.clear();
    setRolling(true);
    setRollResult(null);
    pendingModRef.current = modifier;
    setCounts(zeroCounts());

    const rollGroups = DICE_SIZES.filter((d) => counts[d] > 0).map((d) => `${counts[d]}d${d}`);

    try {
      const results = await box.roll(rollGroups);
      if (!results?.length) { setRolling(false); return; }

      const mod = pendingModRef.current;
      const diceTotal = results.reduce((s, r) => s + r.value, 0);
      const total = diceTotal + mod;
      const isCritNat20 = results.length === 1 && results[0]?.sides === 20 && results[0]?.value === 20;
      const isNat1 = results.length === 1 && results[0]?.sides === 20 && results[0]?.value === 1;

      setRollResult({ notation, total, modifier: mod, isCritNat20, isNat1 });
      setRolling(false);
      rollDice.mutate({ sceneId, notation, result: total, modifier: mod });

      clearTimerRef.current = setTimeout(() => {
        box.clear();
        setRollResult(null);
      }, SHOW_MS);
    } catch {
      setRolling(false);
    }
  }

  const notation = buildNotation(counts);
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
                    {roll.notation}
                    {roll.modifier !== 0 && (roll.modifier > 0 ? ` +${roll.modifier}` : ` ${roll.modifier}`)}
                    {" → "}
                    <span style={{ fontSize: 14 }}>{total}</span>
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}

        {/* Die selector — tap to add, tap the − badge to remove */}
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
                      onClick={(e) => { e.stopPropagation(); decrement(sides); }}
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
            onClick={canRoll ? handleRoll : undefined}
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
              {rolling ? "Rolling…" : canRoll ? `Roll ${notation}` : "Roll"}
            </Typography>
          </Box>
        </Stack>
      </Box>
    </>
  );
}
