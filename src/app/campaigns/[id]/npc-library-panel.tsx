"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";

import { api, type RouterOutputs } from "~/trpc/react";
import { colorForKey, initialsFor, StatBlockContent, StatBlockDrawer, type StatBlock } from "./token-visuals";

type NpcTemplate = RouterOutputs["npcTemplate"]["list"][number];

export function NpcLibraryPanel({
  campaignId,
  layout = "sidebar",
  onDragStart,
}: {
  campaignId: string;
  layout?: "sidebar" | "full";
  onDragStart?: (e: React.PointerEvent, npc: NpcTemplate) => void;
}) {
  const utils = api.useUtils();
  const { data: npcTemplates } = api.npcTemplate.list.useQuery({ campaignId });

  const createNpcTemplate = api.npcTemplate.create.useMutation({
    onSuccess: () => utils.npcTemplate.list.invalidate({ campaignId }),
  });
  const updateNpcTemplate = api.npcTemplate.update.useMutation({
    onSuccess: () => utils.npcTemplate.list.invalidate({ campaignId }),
  });
  const deleteNpcTemplate = api.npcTemplate.delete.useMutation({
    onSuccess: () => {
      void utils.npcTemplate.list.invalidate({ campaignId });
      setSelectedNpcId(null);
    },
  });
  const importSrdMonster = api.npcTemplate.importFromSrd.useMutation({
    onSuccess: () => {
      void utils.npcTemplate.list.invalidate({ campaignId });
      setSrdQuery("");
    },
  });

  const [npcNameInput, setNpcNameInput] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const filteredNpcTemplates = npcTemplates?.filter((npc) =>
    npc.name.toLowerCase().includes(filterQuery.trim().toLowerCase()),
  );
  const [srdQuery, setSrdQuery] = useState("");
  const srdSearch = api.npcTemplate.searchSrd.useQuery(
    { campaignId, query: srdQuery },
    { enabled: srdQuery.trim().length > 1 },
  );
  const [uploadingNpcId, setUploadingNpcId] = useState<string | null>(null);
  const [viewingStatBlock, setViewingStatBlock] = useState<StatBlock | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);

  const selectedNpc = npcTemplates?.find((n) => n.id === selectedNpcId);

  function handleAddNpc() {
    const name = npcNameInput.trim();
    if (!name) return;
    createNpcTemplate.mutate({ campaignId, name });
    setNpcNameInput("");
  }

  async function handleNpcAvatarChange(npcId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingNpcId(npcId);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = (await fetch("/api/upload/npc-avatar", {
        method: "POST",
        body: fd,
      }).then((r) => r.json())) as { url?: string; error?: string };
      if (!res.url) throw new Error(res.error ?? "Upload failed");
      await updateNpcTemplate.mutateAsync({ id: npcId, avatarUrl: res.url });
    } finally {
      setUploadingNpcId(null);
      e.target.value = "";
    }
  }

  if (layout === "full") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Top toolbar: add + SRD search */}
        <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: "wrap", gap: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ flex: 1, minWidth: 220 }}>
            <TextField
              size="small"
              placeholder="Add custom NPC…"
              value={npcNameInput}
              onChange={(e) => setNpcNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNpc()}
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              onClick={handleAddNpc}
              disabled={!npcNameInput.trim() || createNpcTemplate.isPending}
            >
              Add
            </Button>
          </Stack>
          <Box sx={{ flex: 1, minWidth: 220, position: "relative" }}>
            <TextField
              size="small"
              placeholder="Search SRD monsters…"
              value={srdQuery}
              onChange={(e) => setSrdQuery(e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      {srdSearch.isFetching
                        ? <CircularProgress size={14} sx={{ color: "rgba(255,255,255,0.3)" }} />
                        : <SearchIcon sx={{ fontSize: 18, color: "rgba(255,255,255,0.3)" }} />
                      }
                    </InputAdornment>
                  ),
                },
              }}
            />
            {srdSearch.data && srdSearch.data.length > 0 && srdQuery.length > 1 && (
              <Box
                sx={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  bgcolor: "#1a1c22",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "6px",
                  maxHeight: 220,
                  overflowY: "auto",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}
              >
                {srdSearch.data.map((m) => (
                  <Box
                    key={m.index}
                    component="button"
                    disabled={importSrdMonster.isPending}
                    onClick={() => importSrdMonster.mutate({ campaignId, index: m.index })}
                    sx={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      bgcolor: "transparent",
                      color: "rgba(255,255,255,0.7)",
                      fontSize: 13,
                      px: 1.5,
                      py: 0.75,
                      cursor: "pointer",
                      transition: "background 0.1s",
                      "&:hover": { bgcolor: "rgba(194,163,107,0.1)", color: "primary.main" },
                      "&:disabled": { opacity: 0.5 },
                    }}
                  >
                    {importSrdMonster.isPending ? "Importing…" : `+ ${m.name}`}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Stack>

        {/* Two-column body — stacks vertically on xs since a fixed-width side panel can't fit next to the list */}
        <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, flex: 1, gap: 3, minHeight: 0 }}>
          {/* Left: NPC list */}
          <Box sx={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
            {npcTemplates && npcTemplates.length > 0 && (
              <TextField
                size="small"
                placeholder="Filter your bestiary…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                fullWidth
                sx={{ mb: 1.5 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ fontSize: 16, color: "rgba(255,255,255,0.3)" }} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}
            {npcTemplates?.length === 0 && (
              <Box sx={{ py: 6, textAlign: "center" }}>
                <Typography sx={{ color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
                  Your bestiary is empty.
                </Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.15)", fontSize: 12, mt: 0.5 }}>
                  Add a custom NPC above or search the SRD.
                </Typography>
              </Box>
            )}
            {npcTemplates && npcTemplates.length > 0 && filteredNpcTemplates?.length === 0 && (
              <Typography sx={{ color: "rgba(255,255,255,0.25)", fontSize: 13, py: 2, textAlign: "center" }}>
                No NPCs match &ldquo;{filterQuery}&rdquo;.
              </Typography>
            )}
            <Stack spacing={1}>
              {filteredNpcTemplates?.map((npc) => {
                const isSelected = selectedNpcId === npc.id;
                return (
                  <Box
                    key={npc.id}
                    onClick={() => setSelectedNpcId(isSelected ? null : npc.id)}
                    onPointerDown={onDragStart ? (e) => onDragStart(e, npc) : undefined}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: "8px",
                      border: "1px solid",
                      borderColor: isSelected ? "rgba(194,163,107,0.5)" : "rgba(255,255,255,0.07)",
                      bgcolor: isSelected ? "rgba(194,163,107,0.06)" : "rgba(255,255,255,0.02)",
                      cursor: onDragStart ? "grab" : "pointer",
                      touchAction: "none",
                      userSelect: "none",
                      transition: "border-color 0.15s, background 0.15s",
                      "&:hover": {
                        borderColor: isSelected ? "rgba(194,163,107,0.7)" : "rgba(255,255,255,0.15)",
                        bgcolor: isSelected ? "rgba(194,163,107,0.08)" : "rgba(255,255,255,0.04)",
                      },
                    }}
                  >
                    {/* Avatar */}
                    <Tooltip title="Click to change portrait">
                      <Box
                        component="label"
                        htmlFor={`npc-avatar-full-${npc.id}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        sx={{ position: "relative", display: "inline-flex", cursor: "pointer", flexShrink: 0 }}
                      >
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            background: npc.avatarUrl
                              ? `url(${npc.avatarUrl})`
                              : `linear-gradient(145deg, rgba(255,255,255,0.35), rgba(255,255,255,0) 50%), ${colorForKey(npc.id)}`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            color: "#13151a",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            fontWeight: 700,
                            border: isSelected ? "2px solid rgba(194,163,107,0.6)" : "2px solid transparent",
                            transition: "border-color 0.15s",
                          }}
                        >
                          {!npc.avatarUrl && initialsFor(npc.name)}
                        </Box>
                        {uploadingNpcId === npc.id && (
                          <Box sx={{ position: "absolute", inset: 0, borderRadius: "50%", bgcolor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <CircularProgress size={16} sx={{ color: "white" }} />
                          </Box>
                        )}
                      </Box>
                    </Tooltip>
                    <input
                      id={`npc-avatar-full-${npc.id}`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => handleNpcAvatarChange(npc.id, e)}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{ display: "none" }}
                    />

                    {/* Name + meta */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 500, fontSize: 14 }} noWrap>
                        {npc.name}
                      </Typography>
                      {npc.source && (
                        <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }} noWrap>
                          {npc.source}
                        </Typography>
                      )}
                    </Box>

                    {/* Delete */}
                    <IconButton
                      size="small"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); deleteNpcTemplate.mutate({ id: npc.id }); }}
                      sx={{ color: "rgba(255,255,255,0.2)", "&:hover": { color: "error.main" }, flexShrink: 0 }}
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                );
              })}
            </Stack>
          </Box>

          <Divider
            orientation="vertical"
            flexItem
            sx={{ borderColor: "rgba(255,255,255,0.07)", display: { xs: "none", sm: "block" } }}
          />

          {/* Right: stat block panel */}
          <Box
            sx={{
              width: { xs: "100%", sm: 320 },
              flexShrink: 0,
              overflowY: "auto",
              pl: { xs: 0, sm: 1 },
              pt: { xs: selectedNpc ? 2 : 0, sm: 0 },
              borderTop: { xs: selectedNpc ? "1px solid rgba(255,255,255,0.07)" : "none", sm: "none" },
            }}
          >
            {selectedNpc?.statBlock ? (
              <Box>
                <Typography variant="h2" sx={{ fontSize: 20, mb: 0.5 }}>
                  {selectedNpc.name}
                </Typography>
                <StatBlockContent statBlock={selectedNpc.statBlock as unknown as StatBlock} />
              </Box>
            ) : (
              <Box sx={{ py: 6, textAlign: "center" }}>
                <Typography sx={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
                  {selectedNpc ? "No stat block available." : "Select an NPC to view its stat block."}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // ── Sidebar layout (original, used on stage) ──────────────────────────────
  return (
    <Box>
      {npcTemplates && npcTemplates.length > 3 && (
        <TextField
          size="small"
          placeholder="Filter…"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          fullWidth
          sx={{ mb: 1 }}
          slotProps={{
            htmlInput: { style: { fontSize: 12.5 } },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }} />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
      <Stack spacing={0.75} sx={{ mb: 1.5 }}>
        {filteredNpcTemplates?.map((npc) => (
          <Stack
            key={npc.id}
            direction="row"
            spacing={0.75}
            sx={{
              alignItems: "center",
              p: 0.75,
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.08)",
              cursor: onDragStart ? "grab" : "default",
              touchAction: "none",
              userSelect: "none",
              "&:hover": { borderColor: "rgba(194,163,107,0.4)" },
            }}
            onPointerDown={onDragStart ? (e) => onDragStart(e, npc) : undefined}
          >
            <Tooltip title="Click to change portrait">
              <Box
                component="label"
                htmlFor={`npc-avatar-${npc.id}`}
                onPointerDown={(e) => e.stopPropagation()}
                sx={{ position: "relative", display: "inline-flex", cursor: "pointer", flexShrink: 0 }}
              >
                <Box
                  sx={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: npc.avatarUrl
                      ? `url(${npc.avatarUrl})`
                      : `linear-gradient(145deg, rgba(255,255,255,0.4), rgba(255,255,255,0) 45%), ${colorForKey(npc.id)}`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    color: "#13151a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {!npc.avatarUrl && initialsFor(npc.name)}
                </Box>
                {uploadingNpcId === npc.id && (
                  <Box sx={{ position: "absolute", inset: 0, borderRadius: "50%", bgcolor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CircularProgress size={14} sx={{ color: "white" }} />
                  </Box>
                )}
              </Box>
            </Tooltip>
            <input
              id={`npc-avatar-${npc.id}`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleNpcAvatarChange(npc.id, e)}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ display: "none" }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 12.5 }} noWrap>{npc.name}</Typography>
              {npc.source && (
                <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }} noWrap>{npc.source}</Typography>
              )}
            </Box>
            {!!npc.statBlock && (
              <IconButton
                size="small"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setViewingStatBlock(npc.statBlock as unknown as StatBlock)}
                sx={{ p: 0.25, color: "rgba(255,255,255,0.4)", "&:hover": { color: "primary.main" } }}
              >
                <Typography sx={{ fontSize: 13, lineHeight: 1 }}>i</Typography>
              </IconButton>
            )}
            <Box
              component="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => deleteNpcTemplate.mutate({ id: npc.id })}
              sx={{ border: "none", bgcolor: "transparent", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 15, "&:hover": { color: "rgba(255,255,255,0.7)" } }}
            >
              ×
            </Box>
          </Stack>
        ))}
        {npcTemplates?.length === 0 && (
          <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            No NPCs yet — add one below or search the SRD.
          </Typography>
        )}
        {npcTemplates && npcTemplates.length > 0 && filteredNpcTemplates?.length === 0 && (
          <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            No NPCs match &ldquo;{filterQuery}&rdquo;.
          </Typography>
        )}
      </Stack>

      <Stack direction="row" spacing={0.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="e.g. Goblin"
          value={npcNameInput}
          onChange={(e) => setNpcNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddNpc()}
          sx={{ flex: 1 }}
          slotProps={{ htmlInput: { style: { fontSize: 12.5 } } }}
        />
        <Button size="small" variant="outlined" onClick={handleAddNpc} disabled={createNpcTemplate.isPending}>
          Add
        </Button>
      </Stack>

      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", mb: 1 }}>
        Search SRD
      </Typography>
      <TextField
        size="small"
        placeholder="Search monsters…"
        value={srdQuery}
        onChange={(e) => setSrdQuery(e.target.value)}
        fullWidth
        sx={{ mb: 0.5 }}
        slotProps={{ htmlInput: { style: { fontSize: 12.5 } } }}
      />
      {srdSearch.isFetching && (
        <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Searching…</Typography>
      )}
      {srdSearch.data && srdSearch.data.length > 0 && (
        <Stack spacing={0.25} sx={{ maxHeight: 160, overflowY: "auto" }}>
          {srdSearch.data.map((m) => (
            <Box
              key={m.index}
              component="button"
              disabled={importSrdMonster.isPending}
              onClick={() => importSrdMonster.mutate({ campaignId, index: m.index })}
              sx={{ textAlign: "left", border: "none", bgcolor: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 12, py: 0.4, cursor: "pointer", "&:hover": { color: "primary.main" } }}
            >
              + {m.name}
            </Box>
          ))}
        </Stack>
      )}

      <StatBlockDrawer statBlock={viewingStatBlock} onClose={() => setViewingStatBlock(null)} />
    </Box>
  );
}
