"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { AppNav } from "~/app/_components/app-nav";
import { JoinRequestsPanel } from "./join-requests-panel";
import { NpcLibraryPanel } from "./npc-library-panel";

import { useRoomEvents } from "~/lib/use-room-events";
import { api } from "~/trpc/react";

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

  const [sceneName, setSceneName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileSelected, setFileSelected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const createScene = api.scene.create.useMutation({
    onSuccess: () => utils.scene.listForCampaign.invalidate({ campaignId }),
  });
  const setActive = api.scene.setActive.useMutation({
    onSuccess: () => utils.campaign.get.invalidate({ campaignId }),
  });
  const setCoverImage = api.campaign.setCoverImage.useMutation({
    onSuccess: () => utils.campaign.get.invalidate({ campaignId }),
  });

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = (await fetch("/api/upload/campaign-cover", {
        method: "POST",
        body: fd,
      }).then((r) => r.json())) as { url?: string; error?: string };
      if (!res.url) throw new Error(res.error ?? "Upload failed");
      await setCoverImage.mutateAsync({ campaignId, coverImageUrl: res.url });
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  useRoomEvents(`campaign:${campaignId}`, "campaign:changed", () => {
    void utils.campaign.get.invalidate({ campaignId });
    void utils.scene.listForCampaign.invalidate({ campaignId });
  });

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
    <Box>
      <AppNav />
      <Box sx={{ maxWidth: 1000, mx: "auto", px: 3, py: 6 }}>
      {campaign.coverImageUrl && (
        <Box
          sx={{
            height: 180,
            borderRadius: "8px",
            mb: 2,
            backgroundImage: `url(${campaign.coverImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}

      <Typography variant="h3" sx={{ mb: 1 }}>
        {campaign.name}
      </Typography>
      {campaign.isGm && <Chip label="You are the GM" size="small" sx={{ mb: 1 }} />}

      {campaign.isGm && (
        <Box sx={{ mb: 3 }}>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleCoverChange}
            style={{ display: "none" }}
          />
          <Button
            size="small"
            variant="outlined"
            disabled={uploadingCover}
            onClick={() => coverInputRef.current?.click()}
          >
            {uploadingCover
              ? "Uploading…"
              : campaign.coverImageUrl
                ? "Change cover image"
                : "Set cover image"}
          </Button>
        </Box>
      )}

      {campaign.isGm && <JoinRequestsPanel campaignId={campaignId} />}

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

          <Stack spacing={1} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <TextField
                size="small"
                label="New scene name"
                value={sceneName}
                onChange={(e) => setSceneName(e.target.value)}
              />
              <Button
                component="label"
                variant="outlined"
                size="small"
                sx={{ whiteSpace: "nowrap" }}
              >
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
              >
                {uploading ? "Uploading…" : "Create scene"}
              </Button>
            </Stack>
            {uploadError && (
              <Typography sx={{ fontSize: 12, color: "error.main" }}>{uploadError}</Typography>
            )}
          </Stack>
        </Box>
      )}

      {campaign.isGm && myCharacters && myCharacters.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Your characters in this campaign
          </Typography>
          <List>
            {myCharacters.map((character) => {
              const inCampaign = rosterCharacters?.some((c) => c.id === character.id);
              return (
                <ListItem
                  key={character.id}
                  divider
                  secondaryAction={
                    inCampaign ? (
                      <Chip label="In campaign" size="small" />
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={addOwnCharacter.isPending}
                        onClick={() =>
                          addOwnCharacter.mutate({ campaignId, characterId: character.id })
                        }
                      >
                        Add to campaign
                      </Button>
                    )
                  }
                >
                  <ListItemText primary={character.name} />
                </ListItem>
              );
            })}
          </List>
        </Box>
      )}

      {campaign.isGm && (
        <Box sx={{ mb: 4, maxWidth: 420 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            NPC library
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
            Build your roster ahead of a session — search the SRD or add custom NPCs here.
            They&apos;ll be ready to drag onto the map next time you open the stage.
          </Typography>
          <NpcLibraryPanel campaignId={campaignId} />
        </Box>
      )}

      {campaign.activeSceneId ? (
        <Button component={Link} href={`/campaigns/${campaignId}/play`} variant="contained">
          Open stage →
        </Button>
      ) : (
        <Typography color="text.secondary">No active scene yet.</Typography>
      )}
      </Box>
    </Box>
  );
}
