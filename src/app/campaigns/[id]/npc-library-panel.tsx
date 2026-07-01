"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { api, type RouterOutputs } from "~/trpc/react";
import { colorForKey, initialsFor, StatBlockDrawer, type StatBlock } from "./token-visuals";

type NpcTemplate = RouterOutputs["npcTemplate"]["list"][number];

// Shared NPC roster UI — used both on the campaign page (build your library
// ahead of a session) and in the stage sidebar (drag straight onto the map).
// Pass onDragStart to enable dragging; omit it for a plain management list.
export function NpcLibraryPanel({
  campaignId,
  onDragStart,
}: {
  campaignId: string;
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
    onSuccess: () => utils.npcTemplate.list.invalidate({ campaignId }),
  });
  const importSrdMonster = api.npcTemplate.importFromSrd.useMutation({
    onSuccess: () => {
      void utils.npcTemplate.list.invalidate({ campaignId });
      setSrdQuery("");
    },
  });

  const [npcNameInput, setNpcNameInput] = useState("");
  const [srdQuery, setSrdQuery] = useState("");
  const srdSearch = api.npcTemplate.searchSrd.useQuery(
    { campaignId, query: srdQuery },
    { enabled: srdQuery.trim().length > 1 },
  );
  const [uploadingNpcId, setUploadingNpcId] = useState<string | null>(null);
  const [viewingStatBlock, setViewingStatBlock] = useState<StatBlock | null>(null);

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

  return (
    <Box>
      <Stack spacing={0.75} sx={{ mb: 1.5 }}>
        {npcTemplates?.map((npc) => (
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
            <Tooltip title="Click to change avatar">
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
              <Typography sx={{ fontSize: 12.5 }} noWrap>
                {npc.name}
              </Typography>
              {npc.source && (
                <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }} noWrap>
                  {npc.source}
                </Typography>
              )}
            </Box>
            {!!npc.statBlock && (
              <IconButton
                size="small"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setViewingStatBlock(npc.statBlock as unknown as StatBlock)}
                sx={{ p: 0.25 }}
              >
                <InfoOutlinedIcon sx={{ fontSize: 15, color: "rgba(255,255,255,0.4)" }} />
              </IconButton>
            )}
            <Box
              component="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => deleteNpcTemplate.mutate({ id: npc.id })}
              sx={{
                border: "none",
                bgcolor: "transparent",
                color: "rgba(255,255,255,0.3)",
                cursor: "pointer",
                fontSize: 15,
                "&:hover": { color: "rgba(255,255,255,0.7)" },
              }}
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

      <Typography
        sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", mb: 1 }}
      >
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
              sx={{
                textAlign: "left",
                border: "none",
                bgcolor: "transparent",
                color: "rgba(255,255,255,0.65)",
                fontSize: 12,
                py: 0.4,
                cursor: "pointer",
                "&:hover": { color: "primary.main" },
              }}
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
