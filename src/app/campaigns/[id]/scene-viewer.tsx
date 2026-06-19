"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { useRoomEvents } from "~/lib/use-room-events";
import { api, type RouterOutputs } from "~/trpc/react";

type Character = RouterOutputs["campaign"]["listMemberCharacters"][number];

export function SceneViewer({
  campaignId,
  sceneId,
  isGm,
}: {
  campaignId: string;
  sceneId: string;
  isGm: boolean;
}) {
  const utils = api.useUtils();
  const { data: scene } = api.scene.get.useQuery({ sceneId });
  const { data: tokens } = api.token.listForScene.useQuery({ sceneId });
  const { data: fog } = api.token.getFogForViewer.useQuery({ sceneId });
  const { data: memberCharacters } = api.campaign.listMemberCharacters.useQuery(
    { campaignId },
    { enabled: isGm },
  );

  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<{ characterId?: string; label?: string } | null>(null);
  const [pendingCharacterId, setPendingCharacterId] = useState("");
  const [pendingLabel, setPendingLabel] = useState("");
  const [pendingSightFt, setPendingSightFt] = useState(30);

  const refetchAll = () =>
    Promise.all([
      utils.token.listForScene.invalidate({ sceneId }),
      utils.token.getFogForViewer.invalidate({ sceneId }),
    ]);

  const moveToken = api.token.move.useMutation({ onSuccess: refetchAll });
  const createToken = api.token.create.useMutation({
    onSuccess: async () => {
      setPlacing(null);
      await refetchAll();
    },
  });

  useRoomEvents(`scene:${sceneId}`, "scene:changed", () => void refetchAll());

  const revealed = useMemo(
    () => new Set((fog?.revealedCells ?? []).map((c) => `${c.x},${c.y}`)),
    [fog],
  );

  if (!scene) return null;

  const cols = Math.ceil(scene.widthPx / scene.gridSize);
  const rows = Math.ceil(scene.heightPx / scene.gridSize);

  function handleCellClick(x: number, y: number) {
    if (isGm && placing) {
      createToken.mutate({
        sceneId,
        gridX: x,
        gridY: y,
        characterId: placing.characterId,
        label: placing.label,
        sightFt: placing.characterId ? pendingSightFt : 0,
      });
      return;
    }
    if (selectedTokenId) {
      moveToken.mutate({ tokenId: selectedTokenId, gridX: x, gridY: y });
      setSelectedTokenId(null);
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {scene.name}
      </Typography>

      {isGm && (
        <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: "center" }}>
          {memberCharacters && memberCharacters.length > 0 && (
            <TextField
              select
              size="small"
              label="Character"
              value={pendingCharacterId}
              onChange={(e) => setPendingCharacterId(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">— none —</MenuItem>
              {memberCharacters.map((c: Character) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            size="small"
            label="Sight (ft)"
            type="number"
            value={pendingSightFt}
            onChange={(e) => setPendingSightFt(Number(e.target.value))}
            sx={{ width: 100 }}
            disabled={!pendingCharacterId}
          />
          <TextField
            size="small"
            label="NPC label"
            value={pendingLabel}
            onChange={(e) => setPendingLabel(e.target.value)}
            disabled={!!pendingCharacterId}
          />
          <Button
            variant={placing ? "contained" : "outlined"}
            onClick={() =>
              setPlacing(
                placing
                  ? null
                  : {
                      characterId: pendingCharacterId || undefined,
                      label: pendingCharacterId ? undefined : pendingLabel || "NPC",
                    },
              )
            }
          >
            {placing ? "Click the map to place…" : "Place token"}
          </Button>
        </Stack>
      )}

      <Box
        sx={{
          position: "relative",
          width: scene.widthPx,
          height: scene.heightPx,
          backgroundImage: `url(${scene.mapImageUrl})`,
          backgroundSize: "cover",
          overflow: "auto",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        {/* grid + click targets */}
        {Array.from({ length: rows }, (_, y) =>
          Array.from({ length: cols }, (_, x) => (
            <Box
              key={`${x},${y}`}
              onClick={() => handleCellClick(x, y)}
              sx={{
                position: "absolute",
                left: x * scene.gridSize,
                top: y * scene.gridSize,
                width: scene.gridSize,
                height: scene.gridSize,
                border: "1px solid rgba(255,255,255,0.05)",
                cursor: placing || selectedTokenId ? "pointer" : "default",
                bgcolor:
                  !fog?.fogLifted && !revealed.has(`${x},${y}`)
                    ? "rgba(0,0,0,0.85)"
                    : "transparent",
              }}
            />
          )),
        )}

        {/* tokens */}
        {tokens?.map((token) => (
          <Tooltip key={token.id} title={token.character?.name ?? token.label ?? "Token"}>
            <Box
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTokenId(token.id === selectedTokenId ? null : token.id);
              }}
              sx={{
                position: "absolute",
                left: token.gridX * scene.gridSize,
                top: token.gridY * scene.gridSize,
                width: scene.gridSize,
                height: scene.gridSize,
                borderRadius: "50%",
                bgcolor: "primary.main",
                color: "primary.contrastText",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                outline: selectedTokenId === token.id ? "2px solid white" : "none",
                zIndex: 1,
              }}
            >
              {(token.character?.name ?? token.label ?? "?").charAt(0)}
            </Box>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}
