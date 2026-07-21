"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import { api } from "~/trpc/react";

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = api.user.changePassword.useMutation();

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    changePassword.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontFamily: "var(--font-serif), serif" }}>Change password</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {changePassword.isSuccess ? (
            <Alert severity="success">Password updated.</Alert>
          ) : (
            <>
              {changePassword.isError && <Alert severity="error">{changePassword.error.message}</Alert>}
              <TextField
                label="Current password"
                type="password"
                fullWidth
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <TextField
                label="New password"
                type="password"
                fullWidth
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                helperText="At least 8 characters"
              />
              <TextField
                label="Confirm new password"
                type="password"
                fullWidth
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={mismatch}
                helperText={mismatch ? "Passwords don't match" : " "}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} color="inherit">
          {changePassword.isSuccess ? "Close" : "Cancel"}
        </Button>
        {!changePassword.isSuccess && (
          <Button
            variant="contained"
            disabled={!newPassword || newPassword.length < 8 || mismatch || changePassword.isPending}
            onClick={() => changePassword.mutate({ currentPassword: currentPassword || undefined, newPassword })}
          >
            Save
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
