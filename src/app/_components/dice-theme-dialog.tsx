"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import { api } from "~/trpc/react";
import { DICE_THEME_OPTIONS } from "~/lib/dice-themes";

export function DiceThemeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = api.useUtils();
  const themeQuery = api.user.getDiceTheme.useQuery(undefined, { enabled: open });
  const setTheme = api.user.setDiceTheme.useMutation({
    onSuccess: async () => {
      await utils.user.getDiceTheme.invalidate();
      onClose();
    },
  });

  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (open && themeQuery.data) setSelected(themeQuery.data);
  }, [open, themeQuery.data]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontFamily: "var(--font-serif), serif" }}>Dice finish</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
          Choose the look of your 3D dice. This applies whenever you roll, across every campaign.
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" },
            gap: 1.5,
          }}
        >
          {DICE_THEME_OPTIONS.map((option) => {
            const isSelected = selected === option.id;
            return (
              <Box
                key={option.id}
                onClick={() => setSelected(option.id)}
                sx={{
                  cursor: "pointer",
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: isSelected ? "primary.main" : "rgba(255,255,255,0.12)",
                  overflow: "hidden",
                  position: "relative",
                  bgcolor: "rgba(255,255,255,0.03)",
                  transition: "border-color 0.15s ease",
                  "&:hover": { borderColor: isSelected ? "primary.main" : "rgba(255,255,255,0.3)" },
                }}
              >
                {isSelected && (
                  <CheckCircleIcon
                    sx={{ position: "absolute", top: 6, right: 6, fontSize: 20, color: "primary.main" }}
                  />
                )}
                <Box
                  sx={{
                    height: 72,
                    backgroundImage: `url(${option.thumbnail})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <Box sx={{ p: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{option.label}</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.secondary", lineHeight: 1.3 }}>
                    {option.description}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!selected || setTheme.isPending}
          onClick={() => selected && setTheme.mutate({ theme: selected })}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
