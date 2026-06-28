"use client";

import { useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
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
          <ListItem key={character.id} divider>
            <ListItemAvatar>
              <Avatar src={character.tokenUrl ?? undefined}>
                {character.name.charAt(0)}
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={character.name}
              secondary={character.notes ?? undefined}
            />
          </ListItem>
        ))}
      </List>
      </Box>
    </Box>
  );
}
