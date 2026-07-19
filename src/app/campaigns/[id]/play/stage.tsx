"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import GroupsIcon from "@mui/icons-material/Groups";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import SignalCellularAltIcon from "@mui/icons-material/SignalCellularAlt";
import StraightenIcon from "@mui/icons-material/Straighten";
import SquareOutlinedIcon from "@mui/icons-material/SquareOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import SwipeableDrawer from "@mui/material/SwipeableDrawer";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

import { useRoomEvents } from "~/lib/use-room-events";
import { api, type RouterOutputs } from "~/trpc/react";
import { NpcLibraryPanel } from "../npc-library-panel";
import { colorForKey, initialsFor, StatBlockDrawer, type StatBlock } from "../token-visuals";
import { DiceRoller, type DiceRollEntry } from "./dice-roller";

type Token = RouterOutputs["token"]["listForScene"][number];
type Character = RouterOutputs["campaign"]["listMemberCharacters"][number];

const CONDITIONS = [
  { id: "blinded",        label: "Blinded",        color: "#9e9e9e" },
  { id: "charmed",        label: "Charmed",        color: "#e91e8c" },
  { id: "deafened",       label: "Deafened",       color: "#795548" },
  { id: "exhausted",      label: "Exhausted",      color: "#ff7043" },
  { id: "frightened",     label: "Frightened",     color: "#9c27b0" },
  { id: "grappled",       label: "Grappled",       color: "#ff9800" },
  { id: "incapacitated",  label: "Incapacitated",  color: "#f44336" },
  { id: "invisible",      label: "Invisible",      color: "#4dd0e1" },
  { id: "paralyzed",      label: "Paralyzed",      color: "#2196f3" },
  { id: "petrified",      label: "Petrified",      color: "#78909c" },
  { id: "poisoned",       label: "Poisoned",       color: "#66bb6a" },
  { id: "prone",          label: "Prone",          color: "#ffa726" },
  { id: "restrained",     label: "Restrained",     color: "#ef5350" },
  { id: "stunned",        label: "Stunned",        color: "#00bcd4" },
  { id: "unconscious",    label: "Unconscious",    color: "#37474f" },
] as const;

type OverlayTool = "circle" | "cone" | "line" | "square";

type DrawState = {
  tool: OverlayTool;
  startX: number; // world px
  startY: number;
  curX: number;
  curY: number;
};

type ExternalDrag =
  | { kind: "character"; characterId: string; sightFt: number }
  | { kind: "npcTemplate"; templateId: string; sightFt: number };

type PingPayload = { x: number; y: number; userId: string; name: string };
type Ping = PingPayload & { id: string };
type DiceEventPayload = { userId: string; name: string; notation: string; result: number; modifier: number };

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const SIDEBAR_WIDTH = 260;
const LONG_PRESS_MS = 450;
const LONG_PRESS_CANCEL_PX = 6;
const PING_LIFETIME_MS = 2100;

export function Stage({ campaignId }: { campaignId: string }) {
  const { data: session } = useSession();
  const utils = api.useUtils();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { data: campaign } = api.campaign.get.useQuery({ campaignId });
  const sceneId = campaign?.activeSceneId ?? undefined;

  const { data: scene } = api.scene.get.useQuery(
    { sceneId: sceneId! },
    { enabled: !!sceneId },
  );
  const { data: tokens } = api.token.listForScene.useQuery(
    { sceneId: sceneId! },
    { enabled: !!sceneId },
  );
  // "full" = GM sees everything (default), "party" = union of all reveals,
  // any other string = a characterId to see fog through that character's eyes
  const [gmFogMode, setGmFogMode] = useState<string>("full");

  const { data: fog } = api.token.getFogForViewer.useQuery(
    { sceneId: sceneId! },
    { enabled: !!sceneId && (!campaign?.isGm || gmFogMode === "full") },
  );
  const { data: gmFog } = api.token.getFogAsGm.useQuery(
    { sceneId: sceneId!, viewAs: gmFogMode },
    { enabled: !!sceneId && !!campaign?.isGm && gmFogMode !== "full" },
  );
  const activeFog = campaign?.isGm && gmFogMode !== "full" ? gmFog : fog;

  const toggleFogLifted = api.scene.toggleFogLifted.useMutation({
    onSuccess: () => sceneId && void utils.scene.get.invalidate({ sceneId }),
  });
  const { data: memberCharacters } = api.campaign.listMemberCharacters.useQuery(
    { campaignId },
    { enabled: !!campaign?.isGm },
  );
  const { data: allScenes } = api.scene.listForCampaign.useQuery(
    { campaignId },
    { enabled: !!campaign?.isGm },
  );
  const setActiveScene = api.scene.setActive.useMutation({
    onSuccess: () => utils.campaign.get.invalidate({ campaignId }),
  });

  const { data: overlays } = api.overlay.listForScene.useQuery(
    { sceneId: sceneId! },
    { enabled: !!sceneId },
  );
  const createOverlay = api.overlay.create.useMutation({
    onSuccess: () => sceneId && void utils.overlay.listForScene.invalidate({ sceneId }),
  });
  const deleteOverlay = api.overlay.delete.useMutation({
    onSuccess: () => sceneId && void utils.overlay.listForScene.invalidate({ sceneId }),
  });

  function refetchAll() {
    if (!sceneId) return;
    void utils.token.listForScene.invalidate({ sceneId });
    void utils.token.getFogForViewer.invalidate({ sceneId });
    void utils.token.getFogAsGm.invalidate({ sceneId });
    void utils.scene.get.invalidate({ sceneId });
    void utils.overlay.listForScene.invalidate({ sceneId });
  }

  useRoomEvents(sceneId ? `scene:${sceneId}` : undefined, "scene:changed", refetchAll);

  const [pings, setPings] = useState<Ping[]>([]);
  const pingCounter = useRef(0);
  useRoomEvents<PingPayload>(sceneId ? `scene:${sceneId}` : undefined, "scene:ping", (payload) => {
    pingCounter.current += 1;
    const id = `${payload.userId}-${pingCounter.current}`;
    setPings((prev) => [...prev, { ...payload, id }]);
    setTimeout(() => setPings((prev) => prev.filter((p) => p.id !== id)), PING_LIFETIME_MS);
  });
  const sendPing = api.scene.ping.useMutation();

  const [diceRolls, setDiceRolls] = useState<DiceRollEntry[]>([]);
  const diceRollCounter = useRef(0);
  useRoomEvents<DiceEventPayload>(sceneId ? `scene:${sceneId}` : undefined, "scene:dice", (payload) => {
    diceRollCounter.current += 1;
    const entry: DiceRollEntry = { ...payload, id: String(diceRollCounter.current) };
    setDiceRolls((prev) => [...prev.slice(-9), entry]);
  });

  const moveToken = api.token.move.useMutation();
  const createToken = api.token.create.useMutation({ onSuccess: refetchAll });
  const deleteToken = api.token.delete.useMutation({ onSuccess: refetchAll });
  const setConditions = api.token.setConditions.useMutation({
    onMutate: ({ tokenId, conditions }) => {
      if (!sceneId) return;
      utils.token.listForScene.setData({ sceneId }, (old) =>
        old?.map((t) => (t.id === tokenId ? { ...t, conditions } : t)),
      );
    },
    onSettled: () => sceneId && void utils.token.listForScene.invalidate({ sceneId }),
  });

  const setCharacterAvatar = api.campaign.setCharacterAvatar.useMutation({
    onSuccess: () => utils.campaign.listMemberCharacters.invalidate({ campaignId }),
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const fitDone = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const [activeTool, setActiveTool] = useState<"select" | "measure" | OverlayTool>("select");
  const measureState = useRef<{ start: { x: number; y: number } } | null>(null);
  const [measureLine, setMeasureLine] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);

  const [overlayLabel, setOverlayLabel] = useState("");
  const drawState = useRef<DrawState | null>(null);
  const [drawPreview, setDrawPreview] = useState<DrawState | null>(null);
  const [overlayContextMenu, setOverlayContextMenu] = useState<{
    overlayId: string;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const panState = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  // Pinch-to-zoom: tracks each active touch pointer's last known position.
  // Once a second touch joins, pan/measure/draw/long-press are cancelled and
  // pinchState takes over, zooming around the midpoint each move.
  const touchPointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchState = useRef<{ lastDist: number } | null>(null);

  // Long-press-to-ping (default tool only): a timer starts on pointerdown;
  // if the pointer moves past the cancel threshold before it fires, it's a
  // real pan/drag instead. Fired once, never re-armed mid-gesture.
  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    startX: number;
    startY: number;
    worldX: number;
    worldY: number;
    fired: boolean;
  } | null>(null);

  const dragState = useRef<{
    tokenId: string;
    startX: number;
    startY: number;
    origGridX: number;
    origGridY: number;
  } | null>(null);
  const [dragGhost, setDragGhost] = useState<{ tokenId: string; x: number; y: number } | null>(
    null,
  );

  const [characterSight, setCharacterSight] = useState<Record<string, number>>({});
  const [uploadingCharacterId, setUploadingCharacterId] = useState<string | null>(null);
  const [viewingStatBlock, setViewingStatBlock] = useState<StatBlock | null>(null);

  const externalDragRef = useRef<ExternalDrag | null>(null);
  const [externalDragPos, setExternalDragPos] = useState<{ x: number; y: number } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    tokenId: string;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const updateGridSize = api.scene.updateGridSize.useMutation({
    onSuccess: () => sceneId && void utils.scene.get.invalidate({ sceneId }),
  });
  const [gridSizeInput, setGridSizeInput] = useState(scene?.gridSize ?? 70);
  useEffect(() => {
    if (scene) setGridSizeInput(scene.gridSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.gridSize]);

  const fitToContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el || !scene || el.clientWidth === 0 || el.clientHeight === 0) return;
    const fit =
      Math.min(el.clientWidth / scene.widthPx, el.clientHeight / scene.heightPx) * 0.95;
    setZoom(fit);
    setPan({
      x: (el.clientWidth - scene.widthPx * fit) / 2,
      y: (el.clientHeight - scene.heightPx * fit) / 2,
    });
  }, [scene]);

  // Fit the map to the viewport once real container dimensions are available.
  // A single clientWidth/clientHeight read right on mount isn't reliable on
  // iOS Safari — its chrome (URL bar) collapses/expands after first paint, so
  // the container can still be mid-layout with a 0 or stale size at that
  // instant. A ResizeObserver lets us keep trying until we see a real size,
  // instead of permanently locking in a bad fit.
  useEffect(() => {
    if (!scene || !containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => {
      if (fitDone.current) return;
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        fitToContainer();
        fitDone.current = true;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scene, fitToContainer]);

  if (!campaign) return null;

  if (!sceneId || !scene) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <Typography color="text.secondary">No active scene.</Typography>
          <Button component={Link} href={`/campaigns/${campaignId}`} variant="outlined">
            Back to campaign
          </Button>
        </Stack>
      </Box>
    );
  }

  const gridSize = scene.gridSize;
  const activeSceneId = scene.id;
  const placedCharacterIds = new Set(
    (tokens ?? []).map((t) => t.characterId).filter((id): id is string => !!id),
  );
  const contextMenuToken = tokens?.find((t) => t.id === contextMenu?.tokenId);
  const contextMenuStatBlock = contextMenuToken?.npcTemplate?.statBlock as StatBlock | null | undefined;

  function screenToWorld(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }

  function canDrag(token: Token) {
    if (!session?.user) return false;
    if (campaign!.isGm) return true;
    if (token.character?.ownerId === session.user.id) return true;
    return token.controllers.some((c) => c.controlledById === session.user.id);
  }

  // Long-press on empty map → ping. Long-press on a token (GM only) →
  // open the same context menu right-click would, instead of pinging.
  function startLongPress(e: React.PointerEvent, token?: Token) {
    if (activeTool !== "select") return;
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    const clientX = e.clientX;
    const clientY = e.clientY;
    const entry = {
      startX: e.clientX,
      startY: e.clientY,
      worldX: x,
      worldY: y,
      fired: false,
      timer: setTimeout(() => {
        entry.fired = true;
        if (token) {
          if (!campaign!.isGm) return;
          dragState.current = null;
          setDragGhost(null);
          setContextMenu({ tokenId: token.id, mouseX: clientX, mouseY: clientY });
        } else {
          sendPing.mutate({ sceneId: activeSceneId, x, y });
        }
      }, LONG_PRESS_MS),
    };
    longPressRef.current = entry;
  }

  function maybeCancelLongPress(clientX: number, clientY: number) {
    const lp = longPressRef.current;
    if (!lp || lp.fired) return;
    if (Math.hypot(clientX - lp.startX, clientY - lp.startY) > LONG_PRESS_CANCEL_PX) {
      clearTimeout(lp.timer);
      longPressRef.current = null;
    }
  }

  function endLongPress() {
    const lp = longPressRef.current;
    if (lp && !lp.fired) clearTimeout(lp.timer);
    longPressRef.current = null;
  }

  const OVERLAY_TOOLS: OverlayTool[] = ["circle", "cone", "line", "square"];
  function isOverlayTool(t: string): t is OverlayTool {
    return OVERLAY_TOOLS.includes(t as OverlayTool);
  }

  function snapToGrid(px: number) {
    return Math.round(px / gridSize) * gridSize;
  }

  function snapFt(distPx: number) {
    const pxPerFt = gridSize / 5;
    return Math.max(5, Math.round(distPx / pxPerFt / 5) * 5);
  }

  function snapAngle45(angle: number) {
    return Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  }

  function overlayDataFromDraw(ds: DrawState): Record<string, unknown> {
    const { tool, startX, startY, curX, curY } = ds;
    if (tool === "circle") {
      const cx = snapToGrid(startX);
      const cy = snapToGrid(startY);
      const radiusFt = snapFt(Math.hypot(curX - cx, curY - cy));
      return { cx, cy, radiusFt };
    }
    if (tool === "cone") {
      const tx = snapToGrid(startX);
      const ty = snapToGrid(startY);
      const rawAngle = Math.atan2(curY - ty, curX - tx);
      const angle = snapAngle45(rawAngle);
      const lengthFt = snapFt(Math.hypot(curX - tx, curY - ty));
      return { tx, ty, angle, lengthFt };
    }
    if (tool === "line") {
      const x1 = snapToGrid(startX);
      const y1 = snapToGrid(startY);
      const x2 = snapToGrid(curX);
      const y2 = snapToGrid(curY);
      const lengthFt = snapFt(Math.hypot(x2 - x1, y2 - y1));
      const widthFt = 5;
      return { x1, y1, x2, y2, lengthFt, widthFt };
    }
    // square
    const cx = snapToGrid(startX);
    const cy = snapToGrid(startY);
    const sideFt = snapFt(Math.hypot(curX - cx, curY - cy) * Math.SQRT2);
    return { cx, cy, sideFt };
  }

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") {
      touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointers.current.size >= 2) {
        // Second finger just joined — cancel whatever the first finger started
        // (pan/measure/draw/long-press) and switch into pinch-to-zoom.
        endLongPress();
        panState.current = null;
        setIsPanning(false);
        measureState.current = null;
        setMeasureLine(null);
        drawState.current = null;
        setDrawPreview(null);
        containerRef.current?.setPointerCapture(e.pointerId);
        const pts = [...touchPointers.current.values()];
        pinchState.current = { lastDist: Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) };
        return;
      }
    }
    if (e.button !== 0) return; // ignore right-click / middle-click
    if (isOverlayTool(activeTool)) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const ds: DrawState = { tool: activeTool, startX: x, startY: y, curX: x, curY: y };
      drawState.current = ds;
      setDrawPreview({ ...ds });
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (activeTool === "measure") {
      const raw = screenToWorld(e.clientX, e.clientY);
      const start = { x: snapToGrid(raw.x), y: snapToGrid(raw.y) };
      measureState.current = { start };
      setMeasureLine({ start, end: start });
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    panState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setIsPanning(true);
    containerRef.current?.setPointerCapture(e.pointerId);
    startLongPress(e);
  }

  function handleBackgroundPointerMove(e: React.PointerEvent) {
    if (e.pointerType === "touch" && touchPointers.current.has(e.pointerId)) {
      touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointers.current.size >= 2 && pinchState.current) {
        const pts = [...touchPointers.current.values()];
        const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
        const rect = containerRef.current!.getBoundingClientRect();
        const cx = (pts[0]!.x + pts[1]!.x) / 2 - rect.left;
        const cy = (pts[0]!.y + pts[1]!.y) / 2 - rect.top;
        const factor = dist / pinchState.current.lastDist;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
        setPan((p) => ({
          x: cx - (cx - p.x) * (newZoom / zoom),
          y: cy - (cy - p.y) * (newZoom / zoom),
        }));
        setZoom(newZoom);
        pinchState.current = { lastDist: dist };
        return;
      }
    }
    if (drawState.current) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const ds = { ...drawState.current, curX: x, curY: y };
      drawState.current = ds;
      setDrawPreview({ ...ds });
      return;
    }
    if (measureState.current) {
      const raw = screenToWorld(e.clientX, e.clientY);
      setMeasureLine({ start: measureState.current.start, end: { x: snapToGrid(raw.x), y: snapToGrid(raw.y) } });
      return;
    }
    maybeCancelLongPress(e.clientX, e.clientY);
    if (!panState.current) return;
    setPan({
      x: panState.current.panX + (e.clientX - panState.current.startX),
      y: panState.current.panY + (e.clientY - panState.current.startY),
    });
  }

  function handleBackgroundPointerUp(e: React.PointerEvent) {
    if (e.pointerType === "touch") {
      touchPointers.current.delete(e.pointerId);
      if (touchPointers.current.size < 2) pinchState.current = null;
      if (touchPointers.current.size > 0) return; // one finger still down mid-pinch
    }
    if (drawState.current) {
      const ds = drawState.current;
      drawState.current = null;
      setDrawPreview(null);
      const data = overlayDataFromDraw(ds);
      if (!sceneId || !session?.user) return;
      createOverlay.mutate({
        sceneId,
        type: ds.tool,
        color: colorForKey(session.user.id),
        label: overlayLabel.trim() || undefined,
        data,
      });
      return;
    }
    if (measureState.current) {
      measureState.current = null;
      setMeasureLine(null);
      setActiveTool("select"); // one-shot — deselect after a single measurement
      return;
    }
    endLongPress();
    panState.current = null;
    setIsPanning(false);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    setPan((p) => ({
      x: cx - (cx - p.x) * (newZoom / zoom),
      y: cy - (cy - p.y) * (newZoom / zoom),
    }));
    setZoom(newZoom);
  }

  function handleTokenPointerDown(e: React.PointerEvent, token: Token) {
    if (activeTool !== "select") return; // let it bubble — e.g. measuring from a token's cell
    if (!canDrag(token)) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      tokenId: token.id,
      startX: e.clientX,
      startY: e.clientY,
      origGridX: token.gridX,
      origGridY: token.gridY,
    };
    setDragGhost({ tokenId: token.id, x: token.gridX * gridSize, y: token.gridY * gridSize });
    startLongPress(e, token);
  }

  function handleTokenPointerMove(e: React.PointerEvent) {
    const d = dragState.current;
    if (!d) return;
    maybeCancelLongPress(e.clientX, e.clientY);
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;
    setDragGhost({
      tokenId: d.tokenId,
      x: d.origGridX * gridSize + dx,
      y: d.origGridY * gridSize + dy,
    });
  }

  function handleTokenPointerUp(e: React.PointerEvent) {
    const d = dragState.current;
    if (!d) return;
    dragState.current = null;
    endLongPress();

    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;
    const gridX = Math.round((d.origGridX * gridSize + dx) / gridSize);
    const gridY = Math.round((d.origGridY * gridSize + dy) / gridSize);

    setDragGhost(null);

    if (gridX === d.origGridX && gridY === d.origGridY) {
      return;
    }

    // Patch the cache immediately so the token doesn't flash back to its old
    // position while the mutation round-trips and the invalidated query refetches.
    if (sceneId) {
      utils.token.listForScene.setData({ sceneId }, (old) =>
        old?.map((t) => (t.id === d.tokenId ? { ...t, gridX, gridY } : t)),
      );
    }

    moveToken.mutate({ tokenId: d.tokenId, gridX, gridY }, { onSettled: refetchAll });
  }

  function handleTokenContextMenu(e: React.MouseEvent, token: Token) {
    if (!campaign!.isGm) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ tokenId: token.id, mouseX: e.clientX, mouseY: e.clientY });
  }

  function handleDeleteOverlay() {
    if (!overlayContextMenu) return;
    deleteOverlay.mutate({ overlayId: overlayContextMenu.overlayId });
    setOverlayContextMenu(null);
  }

  function handleRemoveToken() {
    if (!contextMenu) return;
    deleteToken.mutate({ tokenId: contextMenu.tokenId });
    setContextMenu(null);
  }

  function handleToggleCondition(conditionId: string) {
    if (!contextMenu) return;
    const token = tokens?.find((t) => t.id === contextMenu.tokenId);
    if (!token) return;
    const current = token.conditions ?? [];
    const next = current.includes(conditionId)
      ? current.filter((c) => c !== conditionId)
      : [...current, conditionId];
    setConditions.mutate({ tokenId: contextMenu.tokenId, conditions: next });
  }

  // --- Sidebar -> map drag-to-place ---

  function startExternalDrag(e: React.PointerEvent, drag: ExternalDrag) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    externalDragRef.current = drag;
    setExternalDragPos({ x: e.clientX, y: e.clientY });
  }

  function handleBodyPointerMove(e: React.PointerEvent) {
    if (!externalDragRef.current) return;
    setExternalDragPos({ x: e.clientX, y: e.clientY });
  }

  function handleBodyPointerUp(e: React.PointerEvent) {
    const drag = externalDragRef.current;
    externalDragRef.current = null;
    setExternalDragPos(null);
    if (!drag || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    if (!inside) return;

    const { x, y } = screenToWorld(e.clientX, e.clientY);
    const gridX = Math.floor(x / gridSize);
    const gridY = Math.floor(y / gridSize);

    if (drag.kind === "character") {
      createToken.mutate({
        sceneId: activeSceneId,
        gridX,
        gridY,
        characterId: drag.characterId,
        sightFt: drag.sightFt,
      });
    } else {
      createToken.mutate({
        sceneId: activeSceneId,
        gridX,
        gridY,
        npcTemplateId: drag.templateId,
        sightFt: drag.sightFt,
      });
    }
  }

  async function handleCharacterAvatarChange(
    characterId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCharacterId(characterId);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = (await fetch("/api/upload/character-avatar", {
        method: "POST",
        body: fd,
      }).then((r) => r.json())) as { url?: string; error?: string };
      if (!res.url) throw new Error(res.error ?? "Upload failed");
      await setCharacterAvatar.mutateAsync({ campaignId, characterId, tokenUrl: res.url });
    } finally {
      setUploadingCharacterId(null);
      e.target.value = "";
    }
  }

  function renderOverlaySvgShape(
    type: string,
    data: Record<string, unknown>,
    color: string,
    label?: string | null,
    key?: string,
    isPreview = false,
    onContextMenu?: (e: React.MouseEvent<SVGGElement>) => void,
  ) {
    const pxPerFt = gridSize / 5;
    const opacity = isPreview ? 0.5 : 0.3;
    const strokeOpacity = isPreview ? 0.8 : 0.85;
    const fillColor = color + "4d"; // 30% opacity hex
    const strokeColor = color;

    let shape: React.ReactNode = null;
    let labelX = 0;
    let labelY = 0;

    if (type === "circle") {
      const cx = (data.cx as number) ?? 0;
      const cy = (data.cy as number) ?? 0;
      const radiusFt = (data.radiusFt as number) ?? 5;
      const r = radiusFt * pxPerFt;
      labelX = cx;
      labelY = cy;
      shape = (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={fillColor}
          fillOpacity={opacity}
          stroke={strokeColor}
          strokeWidth={2 / zoom}
          strokeOpacity={strokeOpacity}
        />
      );
    } else if (type === "cone") {
      const tx = (data.tx as number) ?? 0;
      const ty = (data.ty as number) ?? 0;
      const angle = (data.angle as number) ?? 0;
      const lengthFt = (data.lengthFt as number) ?? 15;
      const len = lengthFt * pxPerFt;
      const halfAngle = Math.PI / 8; // 22.5° each side → 45° total
      const a1 = angle - halfAngle;
      const a2 = angle + halfAngle;
      const x1 = tx + Math.cos(a1) * len;
      const y1 = ty + Math.sin(a1) * len;
      const x2 = tx + Math.cos(a2) * len;
      const y2 = ty + Math.sin(a2) * len;
      const d = `M ${tx} ${ty} L ${x1} ${y1} A ${len} ${len} 0 0 1 ${x2} ${y2} Z`;
      labelX = tx + Math.cos(angle) * (len / 2);
      labelY = ty + Math.sin(angle) * (len / 2);
      shape = (
        <path
          d={d}
          fill={fillColor}
          fillOpacity={opacity}
          stroke={strokeColor}
          strokeWidth={2 / zoom}
          strokeOpacity={strokeOpacity}
        />
      );
    } else if (type === "line") {
      const x1 = (data.x1 as number) ?? 0;
      const y1 = (data.y1 as number) ?? 0;
      const x2 = (data.x2 as number) ?? 0;
      const y2 = (data.y2 as number) ?? 0;
      const widthFt = (data.widthFt as number) ?? 5;
      const halfW = (widthFt * pxPerFt) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * halfW;
      const ny = (dx / len) * halfW;
      const pts = `${x1 + nx},${y1 + ny} ${x2 + nx},${y2 + ny} ${x2 - nx},${y2 - ny} ${x1 - nx},${y1 - ny}`;
      labelX = (x1 + x2) / 2;
      labelY = (y1 + y2) / 2;
      shape = (
        <polygon
          points={pts}
          fill={fillColor}
          fillOpacity={opacity}
          stroke={strokeColor}
          strokeWidth={2 / zoom}
          strokeOpacity={strokeOpacity}
        />
      );
    } else if (type === "square") {
      const cx = (data.cx as number) ?? 0;
      const cy = (data.cy as number) ?? 0;
      const sideFt = (data.sideFt as number) ?? 10;
      const half = (sideFt * pxPerFt) / 2;
      labelX = cx;
      labelY = cy;
      shape = (
        <rect
          x={cx - half}
          y={cy - half}
          width={half * 2}
          height={half * 2}
          fill={fillColor}
          fillOpacity={opacity}
          stroke={strokeColor}
          strokeWidth={2 / zoom}
          strokeOpacity={strokeOpacity}
        />
      );
    }

    if (!shape) return null;
    const fontSize = Math.max(10, 13 / zoom);
    const smallFontSize = Math.max(8, 11 / zoom);

    // Measurement string derived from the shape data
    let measureText = "";
    if (type === "circle") {
      measureText = `${(data.radiusFt as number) ?? 0} ft radius`;
    } else if (type === "cone") {
      measureText = `${(data.lengthFt as number) ?? 0} ft cone`;
    } else if (type === "line") {
      measureText = `${(data.lengthFt as number) ?? 0} ft line`;
    } else if (type === "square") {
      measureText = `${(data.sideFt as number) ?? 0} ft square`;
    }

    const labelOffset = label ? fontSize * 0.85 : 0;

    return (
      <g
        key={key}
        onContextMenu={onContextMenu}
        style={{ cursor: onContextMenu ? "context-menu" : "default", pointerEvents: onContextMenu ? "auto" : "none" }}
      >
        {shape}
        {/* Drop shadow rect behind text so it's readable on any map */}
        {(label ?? measureText) && (
          <rect
            x={labelX - 52 / zoom}
            y={labelY - (label ? fontSize + smallFontSize * 0.5 + 4 / zoom : smallFontSize * 0.5 + 2 / zoom)}
            width={104 / zoom}
            height={(label ? fontSize + smallFontSize + 6 / zoom : smallFontSize + 4 / zoom)}
            rx={3 / zoom}
            fill="rgba(0,0,0,0.55)"
            style={{ pointerEvents: "none" }}
          />
        )}
        {label && (
          <text
            x={labelX}
            y={labelY - labelOffset}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={strokeColor}
            fontSize={fontSize}
            fontWeight="700"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {label}
          </text>
        )}
        {measureText && (
          <text
            x={labelX}
            y={labelY + labelOffset}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={strokeColor}
            fontSize={smallFontSize}
            fontWeight="500"
            opacity="0.85"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {measureText}
          </text>
        )}
      </g>
    );
  }

  const sidebarBody = campaign.isGm ? (
    <>
      <Typography
        sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", mb: 1 }}
      >
        Party
      </Typography>
      <Stack spacing={0.75} sx={{ mb: 2 }}>
        {memberCharacters
          ?.filter((c: Character) => !placedCharacterIds.has(c.id))
          .map((c: Character) => {
            const sight = characterSight[c.id] ?? 30;
            return (
              <Stack
                key={c.id}
                direction="row"
                spacing={0.75}
                sx={{
                  alignItems: "center",
                  p: 0.75,
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  cursor: "grab",
                  touchAction: "none",
                  userSelect: "none",
                  "&:hover": { borderColor: "rgba(194,163,107,0.4)" },
                }}
                onPointerDown={(e) =>
                  startExternalDrag(e, {
                    kind: "character",
                    characterId: c.id,
                    sightFt: sight,
                  })
                }
              >
                <Tooltip title="Click to change avatar">
                  <Box
                    component="label"
                    htmlFor={`char-avatar-${c.id}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    sx={{ position: "relative", display: "inline-flex", cursor: "pointer", flexShrink: 0 }}
                  >
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: c.tokenUrl
                          ? `url(${c.tokenUrl})`
                          : `linear-gradient(145deg, rgba(255,255,255,0.4), rgba(255,255,255,0) 45%), ${colorForKey(c.id)}`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        color: "#13151a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 9,
                        fontWeight: 700,
                      }}
                    >
                      {!c.tokenUrl && initialsFor(c.name)}
                    </Box>
                    {uploadingCharacterId === c.id && (
                      <Box
                        sx={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: "50%",
                          bgcolor: "rgba(0,0,0,0.5)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <CircularProgress size={12} sx={{ color: "white" }} />
                      </Box>
                    )}
                  </Box>
                </Tooltip>
                <input
                  id={`char-avatar-${c.id}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleCharacterAvatarChange(c.id, e)}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{ display: "none" }}
                />
                <Typography sx={{ fontSize: 12.5, flex: 1, minWidth: 0 }} noWrap>
                  {c.name}
                </Typography>
                <TextField
                  size="small"
                  type="number"
                  value={sight}
                  onChange={(e) =>
                    setCharacterSight((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  sx={{ width: 56 }}
                  slotProps={{ htmlInput: { style: { fontSize: 11, padding: "4px 6px" } } }}
                />
              </Stack>
            );
          })}
        {memberCharacters?.filter((c: Character) => placedCharacterIds.has(c.id)).map((c: Character) => (
          <Stack
            key={c.id}
            direction="row"
            spacing={0.75}
            sx={{ alignItems: "center", p: 0.75, opacity: 0.35 }}
          >
            <Box
              sx={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                bgcolor: "rgba(255,255,255,0.15)",
                flexShrink: 0,
              }}
            />
            <Typography sx={{ fontSize: 12.5 }} noWrap>
              {c.name} — on stage
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Typography
        sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", mb: 1 }}
      >
        NPCs
      </Typography>
      <NpcLibraryPanel
        campaignId={campaignId}
        onDragStart={(e, npc) =>
          startExternalDrag(e, { kind: "npcTemplate", templateId: npc.id, sightFt: npc.sightFt })
        }
      />

      <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.25)", mt: 1 }}>
        Drag a card onto the map to place it. Click an avatar to change it. Right-click a
        token to remove it.
      </Typography>
    </>
  ) : null;

  return (
    <Box
      className="liminal-stage-viewport"
      sx={{
        overflow: "hidden",
        bgcolor: "#0a0b0d",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack
        direction="row"
        spacing={{ xs: 1, sm: 2 }}
        sx={{
          alignItems: "center",
          flexWrap: "wrap",
          rowGap: 1,
          px: 2,
          py: 1,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        <Button
          component={Link}
          href={`/campaigns/${campaignId}`}
          size="small"
          sx={{ color: "rgba(255,255,255,0.5)" }}
        >
          ← Exit
        </Button>
        {campaign.isGm && allScenes && allScenes.length > 1 ? (
          <Select
            size="small"
            value={sceneId ?? ""}
            onChange={(e) => {
              if (e.target.value && e.target.value !== sceneId) {
                setActiveScene.mutate({ campaignId, sceneId: e.target.value });
              }
            }}
            sx={{
              fontSize: 14,
              fontWeight: 500,
              color: "white",
              "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.15)" },
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.3)" },
              "& .MuiSelect-icon": { color: "rgba(255,255,255,0.4)" },
            }}
          >
            {allScenes.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        ) : (
          <Typography sx={{ fontWeight: 500 }}>{scene.name}</Typography>
        )}

        <ToggleButtonGroup
          value={activeTool === "select" ? null : activeTool}
          exclusive
          onChange={(_, val: "measure" | OverlayTool | null) => setActiveTool(val ?? "select")}
          size="small"
          sx={{ "& .MuiToggleButton-root": { border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" } }}
        >
          <Tooltip title="Measure distance">
            <ToggleButton value="measure"><StraightenIcon fontSize="small" /></ToggleButton>
          </Tooltip>
          <Tooltip title="Circle AoE (click center, drag radius)">
            <ToggleButton value="circle"><RadioButtonUncheckedIcon fontSize="small" /></ToggleButton>
          </Tooltip>
          <Tooltip title="Cone AoE (click tip, drag direction)">
            <ToggleButton value="cone"><SignalCellularAltIcon fontSize="small" /></ToggleButton>
          </Tooltip>
          <Tooltip title="Line AoE (click-drag start to end)">
            <ToggleButton value="line"><StraightenIcon fontSize="small" sx={{ transform: "rotate(90deg)" }} /></ToggleButton>
          </Tooltip>
          <Tooltip title="Square AoE (click center, drag size)">
            <ToggleButton value="square"><SquareOutlinedIcon fontSize="small" /></ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>

        {isOverlayTool(activeTool) && (
          <TextField
            size="small"
            placeholder="Label (optional)"
            value={overlayLabel}
            onChange={(e) => setOverlayLabel(e.target.value)}
            sx={{ width: 160 }}
            slotProps={{ htmlInput: { style: { fontSize: 12, padding: "4px 8px" } } }}
          />
        )}

        {campaign.isGm && (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", ml: { xs: 0, sm: "auto" }, flexWrap: "wrap", rowGap: 1 }}
          >
            {/* Lift fog — affects what all players see */}
            <Tooltip title={scene.fogLifted ? "Fog lifted for all players — click to restore" : "Lift fog for all players"}>
              <IconButton
                onClick={() => toggleFogLifted.mutate({ sceneId: activeSceneId, fogLifted: !scene.fogLifted })}
                size="small"
                sx={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 1,
                  color: scene.fogLifted ? "primary.main" : "rgba(255,255,255,0.5)",
                  bgcolor: scene.fogLifted ? "rgba(194,163,107,0.12)" : "transparent",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
                }}
              >
                {scene.fogLifted ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
              </IconButton>
            </Tooltip>

            {/* View-as selector — only changes what the GM sees */}
            <Tooltip title="Change what fog the GM sees (doesn't affect players)">
              <Select
                size="small"
                value={gmFogMode}
                onChange={(e) => setGmFogMode(e.target.value)}
                sx={{
                  fontSize: 12,
                  color: gmFogMode === "full" ? "rgba(255,255,255,0.5)" : "primary.main",
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.12)" },
                  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.25)" },
                  "& .MuiSelect-icon": { color: "rgba(255,255,255,0.4)" },
                }}
              >
                <MenuItem value="full">Full map</MenuItem>
                <MenuItem value="party">Party view</MenuItem>
                {memberCharacters?.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </Tooltip>

            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                Grid (px/5ft)
              </Typography>
              <TextField
                size="small"
                type="number"
                value={gridSizeInput}
                onChange={(e) => setGridSizeInput(Number(e.target.value))}
                onBlur={() => {
                  if (gridSizeInput > 0 && gridSizeInput !== scene.gridSize) {
                    updateGridSize.mutate({ sceneId: activeSceneId, gridSize: gridSizeInput });
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                sx={{ width: 72 }}
              />
            </Stack>
          </Stack>
        )}
      </Stack>

      <Box
        sx={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}
        onPointerMove={handleBodyPointerMove}
        onPointerUp={handleBodyPointerUp}
      >
        {campaign.isGm && !isMobile && (
          <Box
            sx={{
              width: SIDEBAR_WIDTH,
              flexShrink: 0,
              borderRight: "1px solid rgba(255,255,255,0.08)",
              overflowY: "auto",
              p: 1.5,
            }}
          >
            {sidebarBody}
          </Box>
        )}

        {campaign.isGm && isMobile && (
          <>
            <Fab
              size="small"
              onClick={() => setMobileSidebarOpen(true)}
              sx={{
                position: "absolute",
                bottom: 16,
                left: 16,
                zIndex: 10,
                bgcolor: "rgba(20,22,26,0.92)",
                color: "white",
                "&:hover": { bgcolor: "rgba(30,32,36,0.95)" },
              }}
            >
              <GroupsIcon />
            </Fab>
            <SwipeableDrawer
              anchor="bottom"
              open={mobileSidebarOpen}
              onOpen={() => setMobileSidebarOpen(true)}
              onClose={() => setMobileSidebarOpen(false)}
              slotProps={{
                paper: {
                  sx: {
                    maxHeight: "70vh",
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                    p: 1.5,
                    overflowY: "auto",
                    bgcolor: "#0a0b0d",
                  },
                },
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  bgcolor: "rgba(255,255,255,0.2)",
                  mx: "auto",
                  mb: 1.5,
                }}
              />
              {sidebarBody}
            </SwipeableDrawer>
          </>
        )}

        <Tooltip title="Reset view">
          <Fab
            size="small"
            onClick={() => {
              fitToContainer();
              fitDone.current = true;
            }}
            sx={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 10,
              bgcolor: "rgba(20,22,26,0.92)",
              color: "white",
              "&:hover": { bgcolor: "rgba(30,32,36,0.95)" },
            }}
          >
            <CenterFocusStrongIcon />
          </Fab>
        </Tooltip>

        <Box
          ref={containerRef}
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={(e) => {
            handleBackgroundPointerMove(e);
            handleTokenPointerMove(e);
          }}
          onPointerUp={(e) => {
            handleBackgroundPointerUp(e);
            handleTokenPointerUp(e);
          }}
          onPointerCancel={(e) => {
            handleBackgroundPointerUp(e);
            handleTokenPointerUp(e);
          }}
          onWheel={handleWheel}
          sx={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            touchAction: "none",
            userSelect: "none",
            cursor: (activeTool === "measure" || isOverlayTool(activeTool)) ? "crosshair" : isPanning ? "grabbing" : "grab",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              width: scene.widthPx,
              height: scene.heightPx,
              transformOrigin: "0 0",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              backgroundImage: `url(${scene.mapImageUrl})`,
              backgroundSize: "cover",
            }}
          >
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.16) 1px, transparent 1px)",
                backgroundSize: `${gridSize}px ${gridSize}px`,
              }}
            />

            {!activeFog?.fogLifted && (
              <svg
                width={scene.widthPx}
                height={scene.heightPx}
                style={{ position: "absolute", top: 0, left: 0, zIndex: 2, pointerEvents: "none", overflow: "visible" }}
              >
                <defs>
                  <filter
                    id="fog-blur"
                    filterUnits="userSpaceOnUse"
                    x={-gridSize * 2}
                    y={-gridSize * 2}
                    width={scene.widthPx + gridSize * 4}
                    height={scene.heightPx + gridSize * 4}
                  >
                    <feGaussianBlur stdDeviation={gridSize * 0.3} />
                  </filter>
                  <mask id="fog-mask">
                    <rect width={scene.widthPx} height={scene.heightPx} fill="white" />
                    <g filter="url(#fog-blur)">
                      {(activeFog?.revealedCells ?? []).map((c) => (
                        <rect
                          key={`${c.x},${c.y}`}
                          x={c.x * gridSize - gridSize * 0.5}
                          y={c.y * gridSize - gridSize * 0.5}
                          width={gridSize * 2}
                          height={gridSize * 2}
                          fill="black"
                        />
                      ))}
                    </g>
                  </mask>
                </defs>
                <rect
                  width={scene.widthPx}
                  height={scene.heightPx}
                  fill="rgba(18, 15, 28, 0.97)"
                  mask="url(#fog-mask)"
                />
              </svg>
            )}

            {tokens?.map((token) => {
              const ghost = dragGhost?.tokenId === token.id ? dragGhost : null;
              const x = ghost ? ghost.x : token.gridX * gridSize;
              const y = ghost ? ghost.y : token.gridY * gridSize;
              const draggable = canDrag(token);
              const name = token.character?.name ?? token.npcTemplate?.name ?? token.label ?? "?";
              const color = colorForKey(
                token.characterId ?? token.npcTemplateId ?? token.label ?? token.id,
              );
              const avatarUrl =
                token.character?.tokenUrl ?? token.npcTemplate?.avatarUrl ?? token.imageUrl ?? null;
              return (
                <Tooltip key={token.id} title={name}>
                  <Box
                    onPointerDown={(e) => handleTokenPointerDown(e, token)}
                    onContextMenu={(e) => handleTokenContextMenu(e, token)}
                    sx={{
                      position: "absolute",
                      left: x,
                      top: y,
                      width: gridSize,
                      height: gridSize,
                      borderRadius: "50%",
                      background: avatarUrl
                        ? `url(${avatarUrl})`
                        : `linear-gradient(145deg, rgba(255,255,255,0.4), rgba(255,255,255,0) 45%), ${color}`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      border: "2px solid rgba(255,255,255,0.3)",
                      color: "#13151a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: Math.round(gridSize * 0.4),
                      fontWeight: 800,
                      letterSpacing: "-0.03em",
                      textShadow: avatarUrl
                        ? "none"
                        : "0 1px 1px rgba(0,0,0,0.25), 0 -1px 0 rgba(255,255,255,0.4)",
                      cursor: draggable ? "grab" : "default",
                      touchAction: "none",
                      userSelect: "none",
                      zIndex: ghost ? 2 : 1,
                      boxShadow: ghost
                        ? "0 6px 20px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.35)"
                        : "0 2px 6px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.35)",
                    }}
                  >
                    {!avatarUrl && initialsFor(name)}
                    {token.conditions.length > 0 && (
                      <Box
                        sx={{
                          position: "absolute",
                          bottom: -(Math.max(7, Math.round(gridSize * 0.18)) + 3),
                          left: "50%",
                          transform: "translateX(-50%)",
                          display: "flex",
                          gap: "2px",
                          pointerEvents: "none",
                          zIndex: 3,
                        }}
                      >
                        {token.conditions.slice(0, 6).map((c) => {
                          const cond = CONDITIONS.find((cd) => cd.id === c);
                          const size = Math.max(7, Math.round(gridSize * 0.18));
                          return (
                            <Box
                              key={c}
                              title={cond?.label ?? c}
                              sx={{
                                width: size,
                                height: size,
                                borderRadius: "50%",
                                bgcolor: cond?.color ?? "#888",
                                border: "1px solid rgba(0,0,0,0.55)",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.7)",
                                flexShrink: 0,
                              }}
                            />
                          );
                        })}
                      </Box>
                    )}
                  </Box>
                </Tooltip>
              );
            })}

            {/* Overlay SVG layer — persisted shapes + live draw preview */}
            <svg
              width={scene.widthPx}
              height={scene.heightPx}
              style={{ position: "absolute", top: 0, left: 0, zIndex: 3, overflow: "visible", pointerEvents: "none" }}
            >
              {overlays?.map((ov) => {
                const isOwn = ov.userId === session?.user?.id;
                const canDelete = isOwn || campaign.isGm;
                return renderOverlaySvgShape(
                  ov.type,
                  ov.data as Record<string, unknown>,
                  ov.color,
                  ov.label,
                  ov.id,
                  false,
                  canDelete
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOverlayContextMenu({ overlayId: ov.id, mouseX: e.clientX, mouseY: e.clientY });
                      }
                    : undefined,
                );
              })}
              {drawPreview &&
                renderOverlaySvgShape(
                  drawPreview.tool,
                  overlayDataFromDraw(drawPreview),
                  session?.user?.id ? colorForKey(session.user.id) : "#c2a36b",
                  overlayLabel.trim() || null,
                  "preview",
                  true,
                )}
            </svg>

            {measureLine && (
              <>
                <svg
                  width={scene.widthPx}
                  height={scene.heightPx}
                  style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 5 }}
                >
                  <line
                    x1={measureLine.start.x}
                    y1={measureLine.start.y}
                    x2={measureLine.end.x}
                    y2={measureLine.end.y}
                    stroke="#c2a36b"
                    strokeWidth={2 / zoom}
                    strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                  />
                  <circle cx={measureLine.start.x} cy={measureLine.start.y} r={4 / zoom} fill="#c2a36b" />
                  <circle cx={measureLine.end.x} cy={measureLine.end.y} r={4 / zoom} fill="#c2a36b" />
                </svg>
                <Box
                  sx={{
                    position: "absolute",
                    left: (measureLine.start.x + measureLine.end.x) / 2,
                    top: (measureLine.start.y + measureLine.end.y) / 2,
                    transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                    bgcolor: "rgba(10,11,13,0.9)",
                    border: "1px solid rgba(194,163,107,0.5)",
                    borderRadius: "4px",
                    px: 1,
                    py: 0.25,
                    pointerEvents: "none",
                    zIndex: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "primary.main" }}>
                    {Math.round(
                      (Math.hypot(
                        measureLine.end.x - measureLine.start.x,
                        measureLine.end.y - measureLine.start.y,
                      ) /
                        gridSize) *
                        5,
                    )}{" "}
                    ft
                  </Typography>
                </Box>
              </>
            )}

            {pings.map((ping) => {
              const ringColor = colorForKey(ping.userId);
              return (
                <Box
                  key={ping.id}
                  sx={{
                    position: "absolute",
                    left: ping.x,
                    top: ping.y,
                    width: 0,
                    height: 0,
                    pointerEvents: "none",
                    zIndex: 5,
                    "@keyframes liminalPingFlash": {
                      "0%": { transform: "translate(-50%, -50%) scale(0)", opacity: 0.9 },
                      "100%": { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
                    },
                    "@keyframes liminalPingRing": {
                      "0%": { transform: "translate(-50%, -50%) scale(0.15)", opacity: 1 },
                      "100%": { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
                    },
                    "@keyframes liminalPingDot": {
                      "0%, 100%": { transform: "translate(-50%, -50%) scale(1)" },
                      "50%": { transform: "translate(-50%, -50%) scale(1.4)" },
                    },
                  }}
                >
                  {/* bright initial flash so the eye catches it immediately */}
                  <Box
                    sx={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: 140,
                      height: 140,
                      borderRadius: "50%",
                      background: `radial-gradient(circle, rgba(255,255,255,0.9), ${ringColor}99 35%, transparent 70%)`,
                      transform: "translate(-50%, -50%) scale(0)",
                      animation: "liminalPingFlash 0.5s ease-out",
                    }}
                  />
                  {/* two staggered rings, white halo + colored stroke for contrast on any map */}
                  {[0, 0.25].map((delay) => (
                    <Box
                      key={delay}
                      sx={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: 110,
                        height: 110,
                        borderRadius: "50%",
                        border: `5px solid ${ringColor}`,
                        boxShadow: "0 0 0 2px rgba(255,255,255,0.85), 0 0 18px rgba(0,0,0,0.6)",
                        transform: "translate(-50%, -50%) scale(0.15)",
                        opacity: 0,
                        animation: `liminalPingRing 1.7s ease-out ${delay}s`,
                      }}
                    />
                  ))}
                  <Box
                    sx={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      bgcolor: ringColor,
                      border: "2px solid rgba(255,255,255,0.9)",
                      transform: "translate(-50%, -50%)",
                      boxShadow: `0 0 14px 4px ${ringColor}`,
                      animation: "liminalPingDot 0.6s ease-in-out 3",
                    }}
                  />
                  <Box
                    sx={{
                      position: "absolute",
                      left: 0,
                      top: -42,
                      transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                      transformOrigin: "center bottom",
                      bgcolor: "rgba(10,11,13,0.92)",
                      border: `1.5px solid ${ringColor}`,
                      borderRadius: "5px",
                      px: 1,
                      py: 0.4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: ringColor }}>
                      {ping.name}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        <DiceRoller sceneId={activeSceneId} rolls={diceRolls} />

        {externalDragPos && (
          <Box
            sx={{
              position: "fixed",
              left: externalDragPos.x,
              top: externalDragPos.y,
              transform: "translate(-50%, -50%)",
              width: 32,
              height: 32,
              borderRadius: "50%",
              bgcolor: "primary.main",
              opacity: 0.85,
              pointerEvents: "none",
              zIndex: 1000,
            }}
          />
        )}
      </Box>

      <Menu
        open={!!contextMenu}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        {contextMenuStatBlock && (
          <MenuItem
            onClick={() => {
              setViewingStatBlock(contextMenuStatBlock);
              setContextMenu(null);
            }}
          >
            View stats
          </MenuItem>
        )}
        <MenuItem onClick={handleRemoveToken}>Remove token</MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <Box sx={{ px: 1.5, pb: 1 }}>
          <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.35)", mb: 0.75, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Conditions
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, maxWidth: 230 }}>
            {CONDITIONS.map((cond) => {
              const isActive = contextMenuToken?.conditions.includes(cond.id) ?? false;
              return (
                <Box
                  key={cond.id}
                  onClick={() => handleToggleCondition(cond.id)}
                  sx={{
                    fontSize: 10,
                    fontWeight: 600,
                    px: 0.75,
                    py: 0.3,
                    borderRadius: "4px",
                    cursor: "pointer",
                    border: `1px solid ${isActive ? cond.color : "rgba(255,255,255,0.12)"}`,
                    bgcolor: isActive ? cond.color + "2a" : "transparent",
                    color: isActive ? cond.color : "rgba(255,255,255,0.45)",
                    userSelect: "none",
                    transition: "all 0.1s",
                    "&:hover": { borderColor: cond.color, color: cond.color },
                  }}
                >
                  {cond.label}
                </Box>
              );
            })}
          </Box>
        </Box>
      </Menu>

      <Menu
        open={!!overlayContextMenu}
        onClose={() => setOverlayContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={overlayContextMenu ? { top: overlayContextMenu.mouseY, left: overlayContextMenu.mouseX } : undefined}
      >
        <MenuItem onClick={handleDeleteOverlay}>Delete overlay</MenuItem>
      </Menu>

      <StatBlockDrawer statBlock={viewingStatBlock} onClose={() => setViewingStatBlock(null)} />
    </Box>
  );
}
