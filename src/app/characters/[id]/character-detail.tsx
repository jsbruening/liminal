"use client";

import { useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { AppNav } from "~/app/_components/app-nav";
import { api } from "~/trpc/react";
import type { DdbCharacterSheet } from "~/server/ddb";
import { CharacterSheet } from "./character-sheet";

function relativeTime(date: Date) {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const divisions: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
    { amount: 60, unit: "seconds" },
    { amount: 60, unit: "minutes" },
    { amount: 24, unit: "hours" },
    { amount: 7, unit: "days" },
    { amount: 4.35, unit: "weeks" },
    { amount: 12, unit: "months" },
    { amount: Number.POSITIVE_INFINITY, unit: "years" },
  ];
  let value = seconds;
  for (const { amount, unit } of divisions) {
    if (Math.abs(value) < amount) return rtf.format(Math.round(value), unit);
    value /= amount;
  }
  return rtf.format(Math.round(value), "years");
}

export function CharacterDetail({ characterId }: { characterId: string }) {
  const utils = api.useUtils();
  const { data: character } = api.character.get.useQuery({ id: characterId });

  const [url, setUrl] = useState("");
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);

  const importFromDdb = api.character.importFromDdb.useMutation({
    onSuccess: async () => {
      setUrl("");
      await utils.character.get.invalidate({ id: characterId });
    },
  });
  const resync = api.character.resync.useMutation({
    onSuccess: () => utils.character.get.invalidate({ id: characterId }),
  });
  const unlinkDdb = api.character.unlinkDdb.useMutation({
    onSuccess: () => {
      setConfirmingUnlink(false);
      return utils.character.get.invalidate({ id: characterId });
    },
  });

  if (!character) return null;

  const activeError = importFromDdb.error ?? resync.error ?? unlinkDdb.error;
  const sheet = character.ddbSheet as DdbCharacterSheet | null;

  return (
    <Box>
      <AppNav />
      <Box sx={{ maxWidth: 700, mx: "auto", px: 3, py: 6 }}>
        <Button component={Link} href="/characters" size="small" sx={{ mb: 2, color: "rgba(255,255,255,0.5)" }}>
          ← Back to characters
        </Button>

        {activeError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {activeError.message}
          </Alert>
        )}

        {!character.ddbUrl && (
          <Box>
            <Typography variant="h3" sx={{ mb: 1 }}>
              {character.name}
            </Typography>
            <Typography sx={{ color: "text.secondary", mb: 3 }}>
              Link a D&D Beyond character to import its stats and show a full sheet here.
            </Typography>
            <Stack
              component="form"
              direction="row"
              spacing={2}
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim()) importFromDdb.mutate({ id: characterId, url: url.trim() });
              }}
            >
              <TextField
                label="D&D Beyond character URL"
                placeholder="https://www.dndbeyond.com/characters/12345678"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                size="small"
                fullWidth
                disabled={importFromDdb.isPending}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={importFromDdb.isPending || !url.trim()}
                startIcon={importFromDdb.isPending ? <CircularProgress size={16} /> : undefined}
              >
                Import
              </Button>
            </Stack>
          </Box>
        )}

        {character.ddbUrl && sheet && (
          <Box>
            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: "center", mb: 3, flexWrap: "wrap", rowGap: 1 }}
            >
              <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                {character.ddbImportedAt
                  ? `Last synced ${relativeTime(new Date(character.ddbImportedAt))}`
                  : ""}
              </Typography>
              <Button
                size="small"
                onClick={() => resync.mutate({ id: characterId })}
                disabled={resync.isPending}
                startIcon={resync.isPending ? <CircularProgress size={14} /> : undefined}
              >
                Re-sync
              </Button>
              {confirmingUnlink ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    Remove the D&D Beyond link?
                  </Typography>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => unlinkDdb.mutate({ id: characterId })}
                    disabled={unlinkDdb.isPending}
                  >
                    Confirm
                  </Button>
                  <Button size="small" onClick={() => setConfirmingUnlink(false)}>
                    Cancel
                  </Button>
                </Stack>
              ) : (
                <Button size="small" color="error" onClick={() => setConfirmingUnlink(true)}>
                  Unlink
                </Button>
              )}
            </Stack>
            <CharacterSheet sheet={sheet} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
