"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type DiceBox from "@3d-dice/dice-box";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { api } from "~/trpc/react";
import { DEFAULT_DICE_THEME } from "~/lib/dice-themes";

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

const CONTAINER_ID = "liminal-dice-box";
const SHOW_MS = 3500;

interface DiceEngineContextValue {
  // rollGroups is an array of dice-box group strings (e.g. ["1d20"] or
  // ["2d6","1d20"] for the free tray's multi-die-type case — dice-box
  // requires an array, not a joined string, for mixed rolls).
  performRoll: (rollGroups: string[], modifier: number, category: RollCategory) => Promise<void>;
  rolling: boolean;
}

const DiceEngineContext = createContext<DiceEngineContextValue | null>(null);

export function useDiceEngine(): DiceEngineContextValue {
  const ctx = useContext(DiceEngineContext);
  if (!ctx) throw new Error("useDiceEngine must be used within a DiceEngineProvider");
  return ctx;
}

// Owns the DiceBox 3D canvas (mounted once, invisible full-viewport overlay),
// the roll pipeline, and the result-popup portal. Mount once per scene and
// let both the desktop docked panel and the mobile drawer share it via
// useDiceEngine() instead of each running their own DiceBox instance.
export function DiceEngineProvider({
  sceneId,
  children,
}: {
  sceneId: string;
  children: React.ReactNode;
}) {
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
  const diceThemeQuery = api.user.getDiceTheme.useQuery();

  useEffect(() => {
    // Wait for the user's saved theme preference before creating the DiceBox
    // (it only reads theme once at construction) so it doesn't flash the
    // default finish before swapping to the real one.
    if (diceThemeQuery.isLoading) return;
    const theme = diceThemeQuery.data ?? DEFAULT_DICE_THEME;

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
          theme,
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
  }, [diceThemeQuery.isLoading, diceThemeQuery.data]);

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

  const labelColor = rollResult?.isCritNat20 ? "#c2a36b" : rollResult?.isNat1 ? "#ef5350" : "white";

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
    <DiceEngineContext.Provider value={{ performRoll, rolling }}>
      {children}
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
    </DiceEngineContext.Provider>
  );
}
