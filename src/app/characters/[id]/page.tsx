import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { CharacterDetail } from "./character-detail";

export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }

  try {
    await api.character.get({ id });
  } catch {
    redirect("/characters");
  }
  await api.character.get.prefetch({ id });

  return (
    <HydrateClient>
      <CharacterDetail characterId={id} />
    </HydrateClient>
  );
}
