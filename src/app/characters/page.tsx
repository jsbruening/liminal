import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { CharactersList } from "./characters-list";

export default async function CharactersPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }

  void api.character.listMine.prefetch();

  return (
    <HydrateClient>
      <CharactersList />
    </HydrateClient>
  );
}
