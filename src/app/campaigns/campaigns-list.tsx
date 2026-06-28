"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { AppNav } from "~/app/_components/app-nav";
import { api, type RouterOutputs } from "~/trpc/react";

type MineCampaign = RouterOutputs["campaign"]["listMine"]["gmed"][number];

function timeAgo(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
  ];
  let amount = seconds;
  for (const [divisor, label] of units) {
    if (amount < divisor) {
      const n = Math.max(1, Math.floor(amount));
      return label === "second" ? "just now" : `${n} ${label}${n === 1 ? "" : "s"} ago`;
    }
    amount = amount / divisor;
  }
  const years = Math.floor(amount);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function CampaignsList() {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: mine } = api.campaign.listMine.useQuery();
  const { data: publicCampaigns } = api.campaign.listPublic.useQuery();
  const { data: characters } = api.character.listMine.useQuery();

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");

  const create = api.campaign.create.useMutation({
    onSuccess: async (campaign) => {
      setModalOpen(false);
      setName("");
      await utils.campaign.listMine.invalidate();
      router.push(`/campaigns/${campaign.id}`);
    },
  });

  const all = [
    ...(mine?.gmed.map((c) => ({ ...c, isGm: true })) ?? []),
    ...(mine?.joined.map((c) => ({ ...c, isGm: false })) ?? []),
  ];

  return (
    <Box>
      <AppNav />

      <Box sx={{ maxWidth: 1040, mx: "auto", px: 4, py: 6.5 }}>
        <Stack
          direction="row"
          sx={{ alignItems: "flex-end", justifyContent: "space-between", mb: 5 }}
        >
          <Box>
            <Typography variant="h1" sx={{ fontSize: { xs: 32, sm: 40 } }}>
              Campaigns
            </Typography>
            <Typography sx={{ fontSize: 14, color: "rgba(255,255,255,0.38)" }}>
              {all.length} campaign{all.length === 1 ? "" : "s"}
            </Typography>
          </Box>
          <Button variant="contained" onClick={() => setModalOpen(true)}>
            + New campaign
          </Button>
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
            gap: 2.25,
          }}
        >
          {all.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}

          <Box
            onClick={() => setModalOpen(true)}
            sx={{
              border: "1px dashed rgba(255,255,255,0.09)",
              borderRadius: "10px",
              minHeight: 200,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.25,
              cursor: "pointer",
              "&:hover": { borderColor: "rgba(194,163,107,0.28)" },
            }}
          >
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                color: "rgba(255,255,255,0.22)",
              }}
            >
              +
            </Box>
            <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.28)" }}>
              New campaign
            </Typography>
          </Box>
        </Box>

        {publicCampaigns && publicCampaigns.length > 0 && (
          <Box sx={{ mt: 7 }}>
            <Typography variant="h5" sx={{ mb: 2 }}>
              Browse campaigns
            </Typography>
            <List>
              {publicCampaigns.map((campaign) => (
                <BrowseCampaignRow
                  key={campaign.id}
                  campaign={campaign}
                  characters={characters ?? []}
                />
              ))}
            </List>
          </Box>
        )}
      </Box>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        slotProps={{
          paper: {
            sx: { bgcolor: "background.paper", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", p: 4, width: "100%", maxWidth: 440 },
          },
        }}
      >
        <Typography variant="h2" sx={{ fontSize: 26, mb: 0.75 }}>
          New campaign
        </Typography>
        <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.4)", mb: 3 }}>
          You&apos;ll be the GM. Invite players after creating.
        </Typography>
        <Stack spacing={0.75} sx={{ mb: 2.5 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.48)" }}>
            Campaign name
          </Typography>
          <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Forgotten Keep"
            autoFocus
            fullWidth
            size="small"
          />
        </Stack>
        <Stack direction="row" spacing={1.25}>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => setModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            fullWidth
            variant="contained"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate({ name: name.trim() })}
            sx={{ flexGrow: 2 }}
          >
            Create campaign
          </Button>
        </Stack>
      </Dialog>
    </Box>
  );
}

function CampaignCard({
  campaign,
}: {
  campaign: MineCampaign & { isGm: boolean };
}) {
  const router = useRouter();

  return (
    <Box
      onClick={() => router.push(`/campaigns/${campaign.id}`)}
      sx={{
        bgcolor: "background.paper",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "10px",
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        "&:hover": {
          borderColor: "rgba(255,255,255,0.15)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        },
      }}
    >
      <Box
        sx={{
          height: 164,
          bgcolor: "#111310",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            color: "rgba(255,255,255,0.15)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Campaign art
        </Typography>
        <Box
          sx={{
            position: "absolute",
            top: 10,
            right: 10,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: campaign.isGm ? "#13151a" : "rgba(255,255,255,0.75)",
            bgcolor: campaign.isGm ? "primary.main" : "rgba(0,0,0,0.55)",
            px: 1,
            py: 0.375,
            borderRadius: "4px",
          }}
        >
          {campaign.isGm ? "GM" : "Player"}
        </Box>
      </Box>

      <Box sx={{ p: "18px 20px 20px" }}>
        <Typography variant="h2" sx={{ fontSize: 21, mb: 1.25 }}>
          {campaign.name}
        </Typography>

        <Stack direction="row" spacing={1.75} sx={{ alignItems: "center", mb: 2 }}>
          <Stack direction="row" spacing={0.625} sx={{ alignItems: "center" }}>
            <PeopleAltOutlinedIcon sx={{ fontSize: 13, color: "rgba(255,255,255,0.28)" }} />
            <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>
              {campaign._count.members} player{campaign._count.members === 1 ? "" : "s"}
            </Typography>
          </Stack>
          {!campaign.isGm && (
            <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
              GM: {campaign.gm.name ?? campaign.gm.email}
            </Typography>
          )}
        </Stack>

        <Box sx={{ height: "1px", bgcolor: "rgba(255,255,255,0.06)", mb: 1.75 }} />

        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          {campaign.activeScene ? (
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: "#5a9e6f",
                  boxShadow: "0 0 5px rgba(90,158,111,0.55)",
                }}
              />
              <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.52)" }}>
                {campaign.activeScene.name}
              </Typography>
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.22)", fontStyle: "italic" }}>
              No active scene
            </Typography>
          )}
          <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
            {timeAgo(campaign.updatedAt)}
          </Typography>
        </Stack>

        {campaign.activeScene && (
          <Button
            fullWidth
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/campaigns/${campaign.id}`);
            }}
            sx={{
              mt: 1.75,
              border: "1px solid rgba(194,163,107,0.28)",
              color: "primary.main",
              "&:hover": { bgcolor: "rgba(194,163,107,0.08)", borderColor: "rgba(194,163,107,0.5)" },
            }}
          >
            Join session →
          </Button>
        )}
      </Box>
    </Box>
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
