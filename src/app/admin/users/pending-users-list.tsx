"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { api } from "~/trpc/react";

export function PendingUsersList() {
  const utils = api.useUtils();
  const { data: pendingUsers } = api.admin.listPendingUsers.useQuery();

  const invalidate = () => utils.admin.listPendingUsers.invalidate();
  const approve = api.admin.approveUser.useMutation({ onSuccess: invalidate });
  const reject = api.admin.rejectUser.useMutation({ onSuccess: invalidate });

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", px: 3, py: 6 }}>
      <Typography variant="h3" sx={{ mb: 3 }}>
        Pending accounts
      </Typography>

      {pendingUsers?.length === 0 && (
        <Typography color="text.secondary">
          No accounts waiting for approval.
        </Typography>
      )}

      <List>
        {pendingUsers?.map((user) => (
          <ListItem
            key={user.id}
            divider
            secondaryAction={
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => approve.mutate({ userId: user.id })}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => reject.mutate({ userId: user.id })}
                >
                  Reject
                </Button>
              </Stack>
            }
          >
            <ListItemText primary={user.name ?? user.email} secondary={user.email} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
