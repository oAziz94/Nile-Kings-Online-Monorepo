import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.variant.findMany({
    where: { name: "14" },
    select: { id: true, sku: true, productId: true },
  });
  console.log(`Renaming ${rows.length} variant(s) from name "14" to "4XL"`);
  for (const row of rows) {
    await prisma.variant.update({ where: { id: row.id }, data: { name: "4XL" } });
    console.log(`  updated ${row.sku}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
