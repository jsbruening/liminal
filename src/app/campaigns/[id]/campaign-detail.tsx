"use client";

import { useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { useRoomEvents } from "~/lib/use-room-events";
import { api } from "~/trpc/react";
import { SceneViewer } from "./scene-viewer";

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

  const [sceneName, setSceneName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createScene = api.scene.create.useMutation({
    onSuccess: () => utils.scene.listForCampaign.invalidate({ campaignId }),
  });
  const setActive = api.scene.setActive.useMutation({
    onSuccess: () => utils.campaign.get.invalidate({ campaignId }),
  });

  useRoomEvents(`campaign:${campaignId}`, "campaign:changed", () => {
    void utils.campaign.get.invalidate({ campaignId });
    void utils.scene.listForCampaign.invalidate({ campaignId });
  });

  async function handleCreateScene() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !sceneName.trim()) return;

    setUploading(true);
    try {
      const [{ width, height }, uploadRes] = await Promise.all([
        readImageDimensions(file),
        fetch("/api/upload/map", {
          method: "POST",
          body: (() => {
            const fd = new FormData();
            fd.set("file", file);
            return fd;
          })(),
        }).then((r) => r.json() as Promise<{ url?: string; error?: string }>),
      ]);

      if (!uploadRes.url) throw new Error(uploadRes.error ?? "Upload failed");

      await createScene.mutateAsync({
        campaignId,
        name: sceneName.trim(),
        mapImageUrl: uploadRes.url,
        widthPx: width,
        heightPx: height,
      });
      setSceneName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  }

  if (!campaign) return null;

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto", px: 3, py: 6 }}>
      <Typography variant="h3" sx={{ mb: 1 }}>
        {campaign.name}
      </Typography>
      {campaign.isGm && <Chip label="You are the GM" size="small" sx={{ mb: 3 }} />}

      {campaign.isGm && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Scenes
          </Typography>
          <List>
            {scenes?.map((scene) => (
              <ListItem
                key={scene.id}
                divider
                secondaryAction={
                  <Button
                    size="small"
                    variant={campaign.activeSceneId === scene.id ? "contained" : "outlined"}
                    onClick={() =>
                      setActive.mutate({
                        campaignId,
                        sceneId: campaign.activeSceneId === scene.id ? null : scene.id,
                      })
                    }
                  >
                    {campaign.activeSceneId === scene.id ? "Active" : "Set active"}
                  </Button>
                }
              >
                <ListItemText primary={scene.name} />
              </ListItem>
            ))}
          </List>

          <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: "center" }}>
            <TextField
              size="small"
              label="New scene name"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
            />
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" />
            <Button
              variant="contained"
              onClick={handleCreateScene}
              disabled={uploading || !sceneName.trim()}
            >
              {uploading ? "Uploading…" : "Create scene"}
            </Button>
          </Stack>
        </Box>
      )}

      {campaign.activeSceneId ? (
        <SceneViewer
          campaignId={campaignId}
          sceneId={campaign.activeSceneId}
          isGm={campaign.isGm}
        />
      ) : (
        <Typography color="text.secondary">No active scene yet.</Typography>
      )}
    </Box>
  );
}
