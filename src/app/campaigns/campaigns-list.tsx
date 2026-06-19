"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { api, type RouterOutputs } from "~/trpc/react";

type Campaign = RouterOutputs["campaign"]["listMine"]["gmed"][number];

export function CampaignsList() {
  const utils = api.useUtils();
  const { data: mine } = api.campaign.listMine.useQuery();
  const { data: publicCampaigns } = api.campaign.listPublic.useQuery();
  const { data: characters } = api.character.listMine.useQuery();

  const [name, setName] = useState("");
  const create = api.campaign.create.useMutation({
    onSuccess: async () => {
      setName("");
      await utils.campaign.listMine.invalidate();
    },
  });

  const leave = api.campaign.leave.useMutation({
    onSuccess: () => utils.campaign.listMine.invalidate(),
  });

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", px: 3, py: 6 }}>
      <Typography variant="h3" sx={{ mb: 3 }}>
        Campaigns
      </Typography>

      <Stack
        component="form"
        direction="row"
        spacing={2}
        sx={{ mb: 5 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ name: name.trim() });
        }}
      >
        <TextField
          label="New campaign name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          fullWidth
        />
        <Button type="submit" variant="contained" disabled={create.isPending}>
          Create
        </Button>
      </Stack>

      <Typography variant="h5" sx={{ mb: 1 }}>
        You GM
      </Typography>
      <List sx={{ mb: 4 }}>
        {mine?.gmed.map((campaign) => (
          <GmCampaignRow key={campaign.id} campaign={campaign} />
        ))}
        {mine?.gmed.length === 0 && (
          <Typography color="text.secondary">
            You aren&apos;t GMing any campaigns yet.
          </Typography>
        )}
      </List>

      <Typography variant="h5" sx={{ mb: 1 }}>
        You&apos;ve joined
      </Typography>
      <List sx={{ mb: 4 }}>
        {mine?.joined.map((campaign) => (
          <ListItem
            key={campaign.id}
            divider
            secondaryAction={
              <Button
                size="small"
                color="error"
                onClick={() => leave.mutate({ campaignId: campaign.id })}
                disabled={leave.isPending}
              >
                Leave
              </Button>
            }
          >
            <ListItemText primary={campaign.name} />
          </ListItem>
        ))}
        {mine?.joined.length === 0 && (
          <Typography color="text.secondary">
            You haven&apos;t joined any campaigns yet.
          </Typography>
        )}
      </List>

      <Typography variant="h5" sx={{ mb: 1 }}>
        Browse campaigns
      </Typography>
      <List>
        {publicCampaigns?.map((campaign) => (
          <BrowseCampaignRow
            key={campaign.id}
            campaign={campaign}
            characters={characters ?? []}
          />
        ))}
        {publicCampaigns?.length === 0 && (
          <Typography color="text.secondary">
            No open campaigns to join right now.
          </Typography>
        )}
      </List>
    </Box>
  );
}

function GmCampaignRow({ campaign }: { campaign: Campaign }) {
  const [expanded, setExpanded] = useState(false);
  const utils = api.useUtils();

  const { data: requests } = api.campaign.listJoinRequests.useQuery(
    { campaignId: campaign.id },
    { enabled: expanded },
  );

  const respond = api.campaign.respondToJoinRequest.useMutation({
    onSuccess: () => utils.campaign.listJoinRequests.invalidate({ campaignId: campaign.id }),
  });

  return (
    <>
      <ListItem
        divider
        secondaryAction={
          <Button size="small" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Hide requests" : "Join requests"}
          </Button>
        }
      >
        <ListItemText primary={campaign.name} />
      </ListItem>
      <Collapse in={expanded}>
        <Stack spacing={1} sx={{ pl: 2, py: 1 }}>
          {requests?.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No pending requests.
            </Typography>
          )}
          {requests?.map((req) => (
            <Stack
              key={req.id}
              direction="row"
              spacing={2}
              sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Typography variant="body2">
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
        <Divider />
      </Collapse>
    </>
  );
}

function BrowseCampaignRow({
  campaign,
  characters,
}: {
  campaign: RouterOutputs["campaign"]["listPublic"][number];
  characters: RouterOutputs["character"]["listMine"];
}) {
  const utils = api.useUtils();
  const [characterId, setCharacterId] = useState("");

  const requestToJoin = api.campaign.requestToJoin.useMutation({
    onSuccess: () => utils.campaign.listPublic.invalidate(),
  });

  if (campaign.myLatestRequestStatus === "PENDING") {
    return (
      <ListItem divider secondaryAction={<Chip label="Request pending" size="small" />}>
        <ListItemText primary={campaign.name} />
      </ListItem>
    );
  }

  return (
    <ListItem
      divider
      secondaryAction={
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {characters.length > 0 && (
            <TextField
              select
              size="small"
              label="Character"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">None</MenuItem>
              {characters.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Button
            size="small"
            variant="contained"
            disabled={requestToJoin.isPending}
            onClick={() =>
              requestToJoin.mutate({
                campaignId: campaign.id,
                characterId: characterId || undefined,
              })
            }
          >
            Request to join
          </Button>
        </Stack>
      }
    >
      <ListItemText
        primary={campaign.name}
        secondary={
          campaign.myLatestRequestStatus === "REJECTED" ? "Previous request was rejected" : undefined
        }
      />
    </ListItem>
  );
}
