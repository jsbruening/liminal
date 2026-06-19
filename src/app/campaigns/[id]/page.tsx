import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { CampaignDetail } from "./campaign-detail";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  try {
    await api.campaign.get({ campaignId: id });
  } catch {
    redirect("/campaigns");
  }
  void api.campaign.get.prefetch({ campaignId: id });
  void api.scene.listForCampaign.prefetch({ campaignId: id });

  return (
    <HydrateClient>
      <CampaignDetail campaignId={id} />
    </HydrateClient>
  );
}
