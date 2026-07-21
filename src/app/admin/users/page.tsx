import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { PendingUsersList } from "./pending-users-list";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    redirect("/");
  }

  await Promise.all([api.admin.listPendingUsers.prefetch(), api.admin.listAllUsers.prefetch()]);

  return (
    <HydrateClient>
      <PendingUsersList />
    </HydrateClient>
  );
}
