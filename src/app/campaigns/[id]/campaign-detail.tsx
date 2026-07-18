"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import MapIcon from "@mui/icons-material/Map";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

import { AppNav } from "~/app/_components/app-nav";
import { JoinRequestsPanel } from "./join-requests-panel";
import { NpcLibraryPanel } from "./npc-library-panel";
import { useRoomEvents } from "~/lib/use-room-events";
import { api } from "~/trpc/react";

type Tab = "overview" | "scenes" | "bestiary";

async function readImageDimensions(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const utils = api.useUtils();
  const { data: campaign } = api.campaign.get.useQuery({ campaignId });
  const { data: scenes } = api.scene.listForCampaign.useQuery({ campaignId });
  const { data: myCharacters } = api.character.listMine.useQuery();
  const { data: rosterCharacters } = api.campaign.listMemberCharacters.useQuery(
    { campaignId },
    { enabled: !!campaign?.isGm },
  );

  const addOwnCharacter = api.campaign.addOwnCharacter.useMutation({
    onSuccess: () => utils.campaign.listMemberCharacters.invalidate({ campaignId }),
  });
  const createScene = api.scene.create.useMutation({
    onSuccess: () => utils.scene.listForCampaign.invalidate({ campaignId }),
  });
  const updateScene = api.scene.update.useMutation({
    onSuccess: () => {
      void utils.scene.listForCampaign.invalidate({ campaignId });
      setEditingSceneId(null);
    },
  });
  const deleteScene = api.scene.delete.useMutation({
    onSuccess: () => {
      void utils.scene.listForCampaign.invalidate({ campaignId });
      void utils.campaign.get.invalidate({ campaignId });
      setDeleteConfirmId(null);
    },
  });
  const setActive = api.scene.setActive.useMutation({
    onSuccess: () => utils.campaign.get.invalidate({ campaignId }),
  });
  const setCoverImage = api.campaign.setCoverImage.useMutation({
    onSuccess: () => utils.campaign.get.invalidate({ campaignId }),
  });

  const [tab, setTab] = useState<Tab>("overview");
  const [sceneName, setSceneName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileSelected, setFileSelected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingSceneName, setEditingSceneName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useRoomEvents(`campaign:${campaignId}`, "campaign:changed", () => {
    void utils.campaign.get.invalidate({ campaignId });
    void utils.scene.listForCampaign.invalidate({ campaignId });
  });

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = (await fetch("/api/upload/campaign-cover", { method: "POST", body: fd }).then((r) => r.json())) as { url?: string; error?: string };
      if (!res.url) throw new Error(res.error ?? "Upload failed");
      await setCoverImage.mutateAsync({ campaignId, coverImageUrl: res.url });
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function handleCreateScene() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !sceneName.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      const [{ width, height }, uploadRes] = await Promise.all([
        readImageDimensions(file),
        fetch("/api/upload/map", {
          method: "POST",
          body: (() => { const fd = new FormData(); fd.set("file", file); return fd; })(),
        }).then((r) => r.json() as Promise<{ url?: string; error?: string }>),
      ]);
      if (!uploadRes.url) throw new Error(uploadRes.error ?? "Upload failed");
      await createScene.mutateAsync({ campaignId, name: sceneName.trim(), mapImageUrl: uploadRes.url, widthPx: width, heightPx: height });
      setSceneName("");
      setFileSelected(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Scene creation failed");
    } finally {
      setUploading(false);
    }
  }

  if (!campaign) return null;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0a0b0d" }}>
      <AppNav />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Box sx={{ position: "relative", height: 300, bgcolor: "#0f1015", overflow: "hidden" }}>
        {campaign.coverImageUrl ? (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${campaign.coverImageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "brightness(0.55) saturate(0.9)",
            }}
          />
        ) : (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(ellipse at 30% 60%, rgba(194,163,107,0.07) 0%, transparent 60%), radial-gradient(ellipse at 70% 30%, rgba(111,143,194,0.06) 0%, transparent 55%)",
            }}
          />
        )}
        {/* Bottom gradient so content is always legible */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(10,11,13,1) 0%, rgba(10,11,13,0.5) 45%, rgba(10,11,13,0.1) 100%)",
          }}
        />

        {/* Hero content */}
        <Box
          sx={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            px: { xs: 2, sm: 4 },
            pb: 3,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box>
            {campaign.isGm && (
              <Chip
                label="Game Master"
                size="small"
                sx={{
                  mb: 1,
                  bgcolor: "rgba(194,163,107,0.12)",
                  color: "#c2a36b",
                  border: "1px solid rgba(194,163,107,0.3)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                }}
              />
            )}
            <Typography
              variant="h1"
              sx={{
                fontFamily: "var(--font-serif), serif",
                fontWeight: 400,
                fontSize: { xs: 32, sm: 42 },
                lineHeight: 1.05,
                letterSpacing: "-0.01em",
                textShadow: "0 2px 16px rgba(0,0,0,0.5)",
              }}
            >
              {campaign.name}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
            {campaign.isGm && (
              <Tooltip title={uploadingCover ? "Uploading…" : campaign.coverImageUrl ? "Change cover image" : "Set cover image"}>
                <span>
                  <IconButton
                    component="label"
                    disabled={uploadingCover}
                    sx={{
                      color: "rgba(255,255,255,0.45)",
                      bgcolor: "rgba(0,0,0,0.4)",
                      backdropFilter: "blur(8px)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      "&:hover": { color: "white", borderColor: "rgba(255,255,255,0.25)" },
                    }}
                  >
                    {uploadingCover ? <CircularProgress size={18} sx={{ color: "inherit" }} /> : <AddPhotoAlternateIcon fontSize="small" />}
                    <input ref={coverInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleCoverChange} style={{ display: "none" }} />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {campaign.activeSceneId ? (
              <Button
                component={Link}
                href={`/campaigns/${campaignId}/play`}
                variant="contained"
                startIcon={<PlayArrowIcon />}
                sx={{
                  fontWeight: 600,
                  px: 2.5,
                  boxShadow: "0 0 24px rgba(194,163,107,0.25)",
                }}
              >
                Enter Stage
              </Button>
            ) : (
              <Button
                variant="outlined"
                disabled
                sx={{ opacity: 0.35, cursor: "not-allowed", borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.4)" }}
              >
                No active scene
              </Button>
            )}
          </Stack>
        </Box>
      </Box>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Box sx={{ borderBottom: "1px solid rgba(255,255,255,0.08)", px: { xs: 2, sm: 4 } }}>
        <Tabs
          value={tab}
          onChange={(_, v: Tab) => setTab(v)}
          sx={{
            "& .MuiTab-root": {
              color: "rgba(255,255,255,0.4)",
              fontWeight: 500,
              fontSize: 13,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              minHeight: 48,
            },
            "& .Mui-selected": { color: "primary.main" },
            "& .MuiTabs-indicator": { bgcolor: "primary.main", height: 2 },
          }}
        >
          <Tab label="Overview" value="overview" />
          {campaign.isGm && <Tab label="Scenes" value="scenes" />}
          {campaign.isGm && <Tab label="Bestiary" value="bestiary" />}
        </Tabs>
      </Box>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <Box sx={{ maxWidth: 1100, mx: "auto", px: { xs: 2, sm: 4 }, py: 4 }}>

        {/* Overview */}
        {tab === "overview" && (
          <Stack spacing={4}>
            {campaign.isGm && <JoinRequestsPanel campaignId={campaignId} />}

            {myCharacters && myCharacters.length > 0 && (
              <Box>
                <Typography
                  sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", mb: 2 }}
                >
                  Your characters
                </Typography>
                <Stack spacing={1}>
                  {myCharacters.map((character) => {
                    const inCampaign = rosterCharacters?.some((c) => c.id === character.id);
                    return (
                      <Paper
                        key={character.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          px: 2,
                          py: 1.5,
                          border: "1px solid",
                          borderColor: inCampaign ? "rgba(194,163,107,0.25)" : "rgba(255,255,255,0.07)",
                          bgcolor: inCampaign ? "rgba(194,163,107,0.04)" : "rgba(255,255,255,0.02)",
                          borderRadius: "8px",
                        }}
                      >
                        <Typography sx={{ fontWeight: 500 }}>{character.name}</Typography>
                        {inCampaign ? (
                          <Chip
                            label="In campaign"
                            size="small"
                            sx={{ bgcolor: "rgba(194,163,107,0.12)", color: "#c2a36b", border: "1px solid rgba(194,163,107,0.25)", fontSize: 11 }}
                          />
                        ) : campaign.isGm ? (
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={addOwnCharacter.isPending}
                            onClick={() => addOwnCharacter.mutate({ campaignId, characterId: character.id })}
                          >
                            Add to campaign
                          </Button>
                        ) : null}
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
            )}

            {!myCharacters?.length && !campaign.isGm && (
              <Typography sx={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
                No characters yet — create one on the Characters page.
              </Typography>
            )}
          </Stack>
        )}

        {/* Scenes */}
        {tab === "scenes" && campaign.isGm && (
          <Box>
            <Stack spacing={1.5} sx={{ mb: 4 }}>
              {scenes?.length === 0 && (
                <Typography sx={{ color: "rgba(255,255,255,0.25)", fontSize: 14, py: 2 }}>
                  No scenes yet — create one below.
                </Typography>
              )}
              {scenes?.map((scene) => {
                const isActive = campaign.activeSceneId === scene.id;
                return (
                  <Paper
                    key={scene.id}
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      alignItems: { xs: "stretch", sm: "center" },
                      border: "1px solid",
                      borderColor: isActive ? "rgba(194,163,107,0.45)" : "rgba(255,255,255,0.08)",
                      bgcolor: isActive ? "rgba(194,163,107,0.04)" : "rgba(255,255,255,0.02)",
                      borderRadius: "8px",
                      overflow: "hidden",
                      transition: "border-color 0.15s",
                      "&:hover": {
                        borderColor: isActive ? "rgba(194,163,107,0.65)" : "rgba(255,255,255,0.16)",
                      },
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center" }}>
                      {/* Map thumbnail */}
                      <Box
                        sx={{
                          width: 130,
                          height: 80,
                          flexShrink: 0,
                          backgroundImage: scene.mapImageUrl ? `url(${scene.mapImageUrl})` : undefined,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          bgcolor: "rgba(255,255,255,0.04)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRight: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {!scene.mapImageUrl && <MapIcon sx={{ color: "rgba(255,255,255,0.15)", fontSize: 28 }} />}
                      </Box>

                      {/* Name / inline edit — sm+ only here; on xs it moves below the thumbnail row */}
                      <Box sx={{ flex: 1, px: 2.5, minWidth: 0, display: { xs: "none", sm: "block" } }}>
                        {editingSceneId === scene.id ? (
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <TextField
                              size="small"
                              value={editingSceneName}
                              onChange={(e) => setEditingSceneName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && editingSceneName.trim())
                                  updateScene.mutate({ sceneId: scene.id, name: editingSceneName.trim() });
                                if (e.key === "Escape") setEditingSceneId(null);
                              }}
                              autoFocus
                              sx={{ maxWidth: 240 }}
                            />
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => editingSceneName.trim() && updateScene.mutate({ sceneId: scene.id, name: editingSceneName.trim() })}
                              disabled={updateScene.isPending || !editingSceneName.trim()}
                            >
                              Save
                            </Button>
                            <Button size="small" onClick={() => setEditingSceneId(null)}>Cancel</Button>
                          </Stack>
                        ) : (
                          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                            <Typography sx={{ fontWeight: 500, fontSize: 15 }} noWrap>
                              {scene.name}
                            </Typography>
                            {isActive && (
                              <Chip
                                label="Active"
                                size="small"
                                sx={{
                                  bgcolor: "rgba(194,163,107,0.15)",
                                  color: "#c2a36b",
                                  border: "1px solid rgba(194,163,107,0.35)",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  letterSpacing: "0.06em",
                                }}
                              />
                            )}
                          </Stack>
                        )}
                      </Box>
                    </Box>

                    {/* Name / inline edit — xs only, full-width row below the thumbnail */}
                    <Box sx={{ px: 2, pt: 1.5, minWidth: 0, display: { xs: "block", sm: "none" } }}>
                      {editingSceneId === scene.id ? (
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <TextField
                            size="small"
                            value={editingSceneName}
                            onChange={(e) => setEditingSceneName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingSceneName.trim())
                                updateScene.mutate({ sceneId: scene.id, name: editingSceneName.trim() });
                              if (e.key === "Escape") setEditingSceneId(null);
                            }}
                            autoFocus
                            sx={{ maxWidth: 240 }}
                          />
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => editingSceneName.trim() && updateScene.mutate({ sceneId: scene.id, name: editingSceneName.trim() })}
                            disabled={updateScene.isPending || !editingSceneName.trim()}
                          >
                            Save
                          </Button>
                          <Button size="small" onClick={() => setEditingSceneId(null)}>Cancel</Button>
                        </Stack>
                      ) : (
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                          <Typography sx={{ fontWeight: 500, fontSize: 15 }} noWrap>
                            {scene.name}
                          </Typography>
                          {isActive && (
                            <Chip
                              label="Active"
                              size="small"
                              sx={{
                                bgcolor: "rgba(194,163,107,0.15)",
                                color: "#c2a36b",
                                border: "1px solid rgba(194,163,107,0.35)",
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                              }}
                            />
                          )}
                        </Stack>
                      )}
                    </Box>

                    {/* Actions */}
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{
                        px: 2,
                        py: { xs: 1, sm: 0 },
                        flexShrink: 0,
                        alignItems: "center",
                        justifyContent: { xs: "flex-end", sm: "flex-start" },
                      }}
                    >
                      {deleteConfirmId === scene.id ? (
                        <>
                          <Typography sx={{ fontSize: 12, color: "error.main", mr: 0.5 }}>Delete?</Typography>
                          <Button size="small" color="error" onClick={() => deleteScene.mutate({ sceneId: scene.id })} disabled={deleteScene.isPending}>Yes</Button>
                          <Button size="small" onClick={() => setDeleteConfirmId(null)}>No</Button>
                        </>
                      ) : (
                        <>
                          <Tooltip title="Rename">
                            <IconButton
                              size="small"
                              onClick={() => { setEditingSceneId(scene.id); setEditingSceneName(scene.name); }}
                              sx={{ color: "rgba(255,255,255,0.35)", "&:hover": { color: "white" } }}
                            >
                              <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete scene">
                            <IconButton
                              size="small"
                              onClick={() => setDeleteConfirmId(scene.id)}
                              sx={{ color: "rgba(255,255,255,0.35)", "&:hover": { color: "error.main" } }}
                            >
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Button
                            size="small"
                            variant={isActive ? "contained" : "outlined"}
                            onClick={() => setActive.mutate({ campaignId, sceneId: isActive ? null : scene.id })}
                            sx={{ ml: 0.5, minWidth: 90 }}
                          >
                            {isActive ? "Active" : "Set active"}
                          </Button>
                        </>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>

            {/* Create scene */}
            <Box
              sx={{
                p: 3,
                border: "1px dashed rgba(255,255,255,0.12)",
                borderRadius: "8px",
                bgcolor: "rgba(255,255,255,0.01)",
              }}
            >
              <Typography
                sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", mb: 2 }}
              >
                New Scene
              </Typography>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 1.5 }}>
                  <TextField
                    size="small"
                    label="Scene name"
                    value={sceneName}
                    onChange={(e) => setSceneName(e.target.value)}
                    sx={{ flex: 1, minWidth: 180 }}
                  />
                  <Button component="label" variant="outlined" size="small" sx={{ whiteSpace: "nowrap", alignSelf: "center" }}>
                    {fileSelected ? "Map selected ✓" : "Choose map image"}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => setFileSelected(!!e.target.files?.[0])}
                    />
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleCreateScene}
                    disabled={uploading || !sceneName.trim() || !fileSelected}
                    sx={{ alignSelf: "center", whiteSpace: "nowrap" }}
                  >
                    {uploading ? "Uploading…" : "Create scene"}
                  </Button>
                </Stack>
                {uploadError && (
                  <Typography sx={{ fontSize: 12, color: "error.main" }}>{uploadError}</Typography>
                )}
              </Stack>
            </Box>
          </Box>
        )}

        {/* Bestiary */}
        {tab === "bestiary" && campaign.isGm && (
          <Box sx={{ height: "calc(100vh - 280px)", minHeight: 400 }}>
            <NpcLibraryPanel campaignId={campaignId} layout="full" />
          </Box>
        )}
      </Box>
    </Box>
  );
}
