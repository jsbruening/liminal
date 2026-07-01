import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { Stage } from "./stage";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }

  let campaign;
  try {
    campaign = await api.campaign.get({ campaignId: id });
  } catch {
    redirect("/campaigns");
  }

  const prefetches = [api.campaign.get.prefetch({ campaignId: id })];
  if (campaign.activeSceneId) {
    const sceneId = campaign.activeSceneId;
    prefetches.push(
      api.scene.get.prefetch({ sceneId }),
      api.token.listForScene.prefetch({ sceneId }),
      api.token.getFogForViewer.prefetch({ sceneId }),
    );
  }
  if (campaign.isGm) {
    prefetches.push(
      api.campaign.listMemberCharacters.prefetch({ campaignId: id }),
      api.npcTemplate.list.prefetch({ campaignId: id }),
    );
  }
  await Promise.all(prefetches);

  return (
    <HydrateClient>
      <Stage campaignId={id} />
    </HydrateClient>
  );
}
