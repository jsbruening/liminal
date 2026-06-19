import bcrypt from "bcryptjs";

import { db } from "../src/server/db";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD to seed the first admin user.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.upsert({
    where: { email },
    update: { isAdmin: true, status: "APPROVED", passwordHash },
    create: {
      email,
      name: "Admin",
      passwordHash,
      isAdmin: true,
      status: "APPROVED",
    },
  });

  console.log(`Admin user ready: ${user.email} (${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
