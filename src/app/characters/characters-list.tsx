"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { AppNav } from "~/app/_components/app-nav";
import { api } from "~/trpc/react";

export function CharactersList() {
  const utils = api.useUtils();
  const { data: characters } = api.character.listMine.useQuery();

  const [name, setName] = useState("");
  const create = api.character.create.useMutation({
    onSuccess: async () => {
      setName("");
      await utils.character.listMine.invalidate();
    },
  });

  const updateCharacter = api.character.update.useMutation({
    onSuccess: () => utils.character.listMine.invalidate(),
  });
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  async function handleAvatarChange(
    characterId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(characterId);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = (await fetch("/api/upload/character-avatar", {
        method: "POST",
        body: fd,
      }).then((r) => r.json())) as { url?: string; error?: string };
      if (!res.url) throw new Error(res.error ?? "Upload failed");
      await updateCharacter.mutateAsync({ id: characterId, tokenUrl: res.url });
    } finally {
      setUploadingId(null);
      e.target.value = "";
    }
  }

  return (
    <Box>
      <AppNav />
      <Box sx={{ maxWidth: 600, mx: "auto", px: 3, py: 6 }}>
      <Typography variant="h3" sx={{ mb: 3 }}>
        Your characters
      </Typography>

      <Stack
        component="form"
        direction="row"
        spacing={2}
        sx={{ mb: 4 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ name: name.trim() });
        }}
      >
        <TextField
          label="New character name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          fullWidth
        />
        <Button type="submit" variant="contained" disabled={create.isPending}>
          Create
        </Button>
      </Stack>

      {characters?.length === 0 && (
        <Typography color="text.secondary">
          You haven&apos;t created any characters yet.
        </Typography>
      )}

      <List>
        {characters?.map((character) => (
          <ListItem key={character.id} divider disablePadding sx={{ pl: 2 }}>
            <ListItemAvatar>
              <Tooltip title="Click to change avatar">
                <Box
                  component="label"
                  htmlFor={`avatar-${character.id}`}
                  sx={{ position: "relative", display: "inline-flex", cursor: "pointer" }}
                >
                  <Avatar src={character.tokenUrl ?? undefined}>
                    {character.name.charAt(0)}
                  </Avatar>
                  {uploadingId === character.id && (
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
                      <CircularProgress size={18} sx={{ color: "white" }} />
                    </Box>
                  )}
                </Box>
              </Tooltip>
              <input
                id={`avatar-${character.id}`}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleAvatarChange(character.id, e)}
                style={{ display: "none" }}
              />
            </ListItemAvatar>
            <ListItemButton component={Link} href={`/characters/${character.id}`}>
              <ListItemText
                primary={character.name}
                secondary={character.notes ?? undefined}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      </Box>
    </Box>
  );
}
