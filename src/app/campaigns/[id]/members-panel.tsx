"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";

import { api } from "~/trpc/react";

export function MembersPanel({ campaignId, isOwner }: { campaignId: string; isOwner: boolean }) {
  const utils = api.useUtils();
  const { data: members } = api.campaign.listMembers.useQuery({ campaignId });
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);

  const invalidate = () =>
    Promise.all([
      utils.campaign.get.invalidate({ campaignId }),
      utils.campaign.listMembers.invalidate({ campaignId }),
    ]);

  const transferGm = api.campaign.transferGm.useMutation({
    onSuccess: async () => {
      setConfirmTarget(null);
      await invalidate();
    },
  });

  const setCoGm = api.campaign.setCoGm.useMutation({ onSuccess: invalidate });

  if (!members?.length) return null;

  return (
    <Box sx={{ mb: 4 }}>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.35)",
          mb: 1.5,
        }}
      >
        Members
      </Typography>
      <Stack spacing={1}>
        {members.map((member) => (
          <Stack
            key={member.id}
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 0.5, sm: 2 }}
            sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
          >
            <Typography variant="body2">{member.name ?? member.email}</Typography>
            {isOwner && (
              <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <FormControlLabel
                  labelPlacement="start"
                  sx={{ ml: 0, gap: 0.5 }}
                  control={
                    <Switch
                      size="small"
                      checked={member.isCoGm}
                      disabled={setCoGm.isPending}
                      onChange={(e) => setCoGm.mutate({ campaignId, userId: member.id, isCoGm: e.target.checked })}
                    />
                  }
                  label={<Typography sx={{ fontSize: 12, color: "text.secondary" }}>Co-GM</Typography>}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    setConfirmTarget({ id: member.id, name: member.name ?? member.email ?? "this player" })
                  }
                >
                  Make GM
                </Button>
              </Stack>
            )}
          </Stack>
        ))}
      </Stack>

      <Dialog open={!!confirmTarget} onClose={() => setConfirmTarget(null)}>
        <DialogTitle>Transfer GM?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmTarget?.name} will become the GM of this campaign. You&apos;ll become a regular member and lose
            GM controls immediately.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmTarget(null)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={transferGm.isPending}
            onClick={() => confirmTarget && transferGm.mutate({ campaignId, newGmId: confirmTarget.id })}
          >
            Transfer GM
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
