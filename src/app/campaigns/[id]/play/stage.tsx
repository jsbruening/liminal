"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import StraightenIcon from "@mui/icons-material/Straighten";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { useRoomEvents } from "~/lib/use-room-events";
import { api, type RouterOutputs } from "~/trpc/react";
import { NpcLibraryPanel } from "../npc-library-panel";
import { colorForKey, initialsFor, StatBlockDrawer, type StatBlock } from "../token-visuals";

type Token = RouterOutputs["token"]["listForScene"][number];
type Character = RouterOutputs["campaign"]["listMemberCharacters"][number];

type ExternalDrag =
  | { kind: "character"; characterId: string; sightFt: number }
  | { kind: "npcTemplate"; templateId: string; sightFt: number };

type PingPayload = { x: number; y: number; userId: string; name: string };
type Ping = PingPayload & { id: string };

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const SIDEBAR_WIDTH = 260;
const LONG_PRESS_MS = 450;
const LONG_PRESS_CANCEL_PX = 6;
const PING_LIFETIME_MS = 2100;

export function Stage({ campaignId }: { campaignId: string }) {
  const { data: session } = useSession();
  const utils = api.useUtils();

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
  const { data: fog } = api.token.getFogForViewer.useQuery(
    { sceneId: sceneId! },
    { enabled: !!sceneId },
  );
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

  function refetchAll() {
    if (!sceneId) return;
    void utils.token.listForScene.invalidate({ sceneId });
    void utils.token.getFogForViewer.invalidate({ sceneId });
    void utils.scene.get.invalidate({ sceneId });
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

  const moveToken = api.token.move.useMutation();
  const createToken = api.token.create.useMutation({ onSuccess: refetchAll });
  const deleteToken = api.token.delete.useMutation({ onSuccess: refetchAll });

  const setCharacterAvatar = api.campaign.setCharacterAvatar.useMutation({
    onSuccess: () => utils.campaign.listMemberCharacters.invalidate({ campaignId }),
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const fitDone = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Toolbar — more tools (ping, draw, etc.) can slot in alongside "measure"
  // later by extending this union.
  const [activeTool, setActiveTool] = useState<"select" | "measure">("select");
  const measureState = useRef<{ start: { x: number; y: number } } | null>(null);
  const [measureLine, setMeasureLine] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);

  const panState = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

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

  // Fit the map to the viewport once, the first time scene dimensions are known.
  useEffect(() => {
    if (!scene || fitDone.current || !containerRef.current) return;
    const el = containerRef.current;
    const fit =
      Math.min(el.clientWidth / scene.widthPx, el.clientHeight / scene.heightPx) * 0.95;
    setZoom(fit);
    setPan({
      x: (el.clientWidth - scene.widthPx * fit) / 2,
      y: (el.clientHeight - scene.heightPx * fit) / 2,
    });
    fitDone.current = true;
  }, [scene]);

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
  const revealed = new Set((fog?.revealedCells ?? []).map((c) => `${c.x},${c.y}`));
  const cols = Math.ceil(scene.widthPx / gridSize);
  const rows = Math.ceil(scene.heightPx / gridSize);
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

  function startLongPress(e: React.PointerEvent) {
    if (activeTool !== "select") return;
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    const entry = {
      startX: e.clientX,
      startY: e.clientY,
      worldX: x,
      worldY: y,
      fired: false,
      timer: setTimeout(() => {
        entry.fired = true;
        sendPing.mutate({ sceneId: activeSceneId, x, y });
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

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (activeTool === "measure") {
      const start = screenToWorld(e.clientX, e.clientY);
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
    if (measureState.current) {
      setMeasureLine({ start: measureState.current.start, end: screenToWorld(e.clientX, e.clientY) });
      return;
    }
    maybeCancelLongPress(e.clientX, e.clientY);
    if (!panState.current) return;
    setPan({
      x: panState.current.panX + (e.clientX - panState.current.startX),
      y: panState.current.panY + (e.clientY - panState.current.startY),
    });
  }

  function handleBackgroundPointerUp() {
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
    startLongPress(e);
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

  function handleRemoveToken() {
    if (!contextMenu) return;
    deleteToken.mutate({ tokenId: contextMenu.tokenId });
    setContextMenu(null);
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

  return (
    <Box
      sx={{
        height: "100vh",
        overflow: "hidden",
        bgcolor: "#0a0b0d",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: "center",
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

        <Tooltip title="Measure distance — click and drag on the map">
          <ToggleButton
            value="measure"
            selected={activeTool === "measure"}
            onChange={() => setActiveTool(activeTool === "measure" ? "select" : "measure")}
            size="small"
            sx={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}
          >
            <StraightenIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>

        {campaign.isGm && (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", ml: "auto" }}>
            <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              Grid size (px / 5ft)
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
              sx={{ width: 80 }}
            />
          </Stack>
        )}
      </Stack>

      <Box
        sx={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}
        onPointerMove={handleBodyPointerMove}
        onPointerUp={handleBodyPointerUp}
      >
        {campaign.isGm && (
          <Box
            sx={{
              width: SIDEBAR_WIDTH,
              flexShrink: 0,
              borderRight: "1px solid rgba(255,255,255,0.08)",
              overflowY: "auto",
              p: 1.5,
            }}
          >
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
          </Box>
        )}

        <Box
          ref={containerRef}
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={(e) => {
            handleBackgroundPointerMove(e);
            handleTokenPointerMove(e);
          }}
          onPointerUp={(e) => {
            handleBackgroundPointerUp();
            handleTokenPointerUp(e);
          }}
          onWheel={handleWheel}
          sx={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            touchAction: "none",
            userSelect: "none",
            cursor: activeTool === "measure" ? "crosshair" : isPanning ? "grabbing" : "grab",
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

            {!fog?.fogLifted &&
              Array.from({ length: rows }, (_, y) =>
                Array.from({ length: cols }, (_, x) =>
                  revealed.has(`${x},${y}`) ? null : (
                    <Box
                      key={`${x},${y}`}
                      sx={{
                        position: "absolute",
                        left: x * gridSize,
                        top: y * gridSize,
                        width: gridSize,
                        height: gridSize,
                        bgcolor: "rgba(0,0,0,0.85)",
                      }}
                    />
                  ),
                ),
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
                  </Box>
                </Tooltip>
              );
            })}

            {measureLine && (
              <>
                <svg
                  width={scene.widthPx}
                  height={scene.heightPx}
                  style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 3 }}
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
      </Menu>

      <StatBlockDrawer statBlock={viewingStatBlock} onClose={() => setViewingStatBlock(null)} />
    </Box>
  );
}
