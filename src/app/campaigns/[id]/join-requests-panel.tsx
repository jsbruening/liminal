"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { api } from "~/trpc/react";

export function JoinRequestsPanel({ campaignId }: { campaignId: string }) {
  const utils = api.useUtils();
  const { data: requests } = api.campaign.listJoinRequests.useQuery({ campaignId });

  const respond = api.campaign.respondToJoinRequest.useMutation({
    onSuccess: () => utils.campaign.listJoinRequests.invalidate({ campaignId }),
  });

  if (!requests?.length) return null;

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Join requests
      </Typography>
      <Stack spacing={1.5}>
        {requests.map((req) => (
          <Stack
            key={req.id}
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 1, sm: 2 }}
            sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
          >
            <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "break-word" }}>
              {req.requester.name ?? req.requester.email}
              {req.character && ` — bringing ${req.character.name}`}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="contained"
                onClick={() => respond.mutate({ joinRequestId: req.id, approve: true })}
              >
                Approve
              </Button>
              <Button
                size="small"
                color="error"
                onClick={() => respond.mutate({ joinRequestId: req.id, approve: false })}
              >
                Reject
              </Button>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
