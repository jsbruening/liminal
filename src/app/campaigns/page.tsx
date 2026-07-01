import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { CampaignsList } from "./campaigns-list";

export default async function CampaignsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }

  await Promise.all([
    api.campaign.listMine.prefetch(),
    api.campaign.listPublic.prefetch(),
    api.character.listMine.prefetch(),
  ]);

  return (
    <HydrateClient>
      <CampaignsList />
    </HydrateClient>
  );
}
