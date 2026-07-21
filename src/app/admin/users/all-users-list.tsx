"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useSession } from "next-auth/react";

import { api } from "~/trpc/react";

const STATUS_COLOR: Record<string, "success" | "warning" | "error" | "default"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "error",
};

export function AllUsersList() {
  const { data: session } = useSession();
  const utils = api.useUtils();
  const { data: users } = api.admin.listAllUsers.useQuery();
  const [resetLink, setResetLink] = useState<{ userName: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const setAdmin = api.admin.setAdmin.useMutation({
    onSuccess: () => utils.admin.listAllUsers.invalidate(),
  });

  const generateLink = api.admin.generatePasswordResetLink.useMutation({
    onSuccess: (result, variables) => {
      const user = users?.find((u) => u.id === variables.userId);
      setCopied(false);
      setResetLink({
        userName: user?.name ?? user?.email ?? "this user",
        url: `${window.location.origin}/reset-password?token=${result.token}`,
      });
    },
  });

  return (
    <Box sx={{ mt: 6 }}>
      <Typography variant="h3" sx={{ mb: 3 }}>
        All accounts
      </Typography>

      <List>
        {users?.map((user) => {
          const isSelf = user.id === session?.user?.id;
          return (
            <ListItem
              key={user.id}
              divider
              secondaryAction={
                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={generateLink.isPending}
                    onClick={() => generateLink.mutate({ userId: user.id })}
                  >
                    Reset password
                  </Button>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Admin</Typography>
                    <Switch
                      size="small"
                      checked={user.isAdmin}
                      disabled={setAdmin.isPending || (isSelf && user.isAdmin)}
                      onChange={(e) => setAdmin.mutate({ userId: user.id, isAdmin: e.target.checked })}
                    />
                  </Box>
                </Stack>
              }
            >
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {user.name ?? user.email}
                    <Chip
                      label={user.status}
                      size="small"
                      color={STATUS_COLOR[user.status] ?? "default"}
                      sx={{ fontSize: 10, height: 18 }}
                    />
                  </Box>
                }
                secondary={user.email}
              />
            </ListItem>
          );
        })}
      </List>

      <Dialog open={!!resetLink} onClose={() => setResetLink(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Password reset link</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Send this link to {resetLink?.userName}. It works once and expires in 24 hours.
          </DialogContentText>
          <TextField
            fullWidth
            size="small"
            value={resetLink?.url ?? ""}
            slotProps={{ input: { readOnly: true } }}
            onFocus={(e) => e.target.select()}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResetLink(null)} color="inherit">
            Close
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (resetLink) await navigator.clipboard.writeText(resetLink.url);
              setCopied(true);
            }}
          >
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
