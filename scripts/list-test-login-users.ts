import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "PARTNER"] } },
    select: {
      id: true,
      phone: true,
      role: true,
      name: true,
      email: true,
      passwordHash: true,
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  console.log(
    JSON.stringify(
      users.map((user) => ({
        id: user.id,
        phone: user.phone,
        role: user.role,
        name: user.name,
        email: user.email,
        hasPassword: Boolean(user.passwordHash),
      })),
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
