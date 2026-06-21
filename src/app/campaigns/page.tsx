import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { CampaignsList } from "./campaigns-list";

export default async function CampaignsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }

  void api.campaign.listMine.prefetch();
  void api.campaign.listPublic.prefetch();
  void api.character.listMine.prefetch();

  return (
    <HydrateClient>
      <CampaignsList />
    </HydrateClient>
  );
}
