import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const GAMAL_PHONE = "01062508999";
const GAMAL_GOVERNORATE = "الجيزة";

function normalizeEgyptMobilePhoneForScript(input: string): string | null {
  const ascii = input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const digits = ascii.replace(/\D/g, "");
  if (/^01[0125]\d{8}$/.test(digits)) return `+2${digits}`;
  if (/^201[0125]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

async function main() {
  const normalizedPhone = normalizeEgyptMobilePhoneForScript(GAMAL_PHONE);
  if (!normalizedPhone) throw new Error("Configured Gamal phone is invalid");

  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: "asc" },
  });
  const matches = partners.filter(
    (partner) => normalizeEgyptMobilePhoneForScript(partner.phone) === normalizedPhone
  );

  if (matches.length === 0) {
    throw new Error(
      `No partner found for normalized phone ${normalizedPhone}. Create Gamal Elsayed first, then rerun.`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple partners found for normalized phone ${normalizedPhone}. Resolve duplicates before backfill.`
    );
  }

  const partner = matches[0]!;
  if (partner.governorate.trim() !== GAMAL_GOVERNORATE) {
    console.warn(
      `[backfill] Partner governorate is "${partner.governorate}", expected "${GAMAL_GOVERNORATE}". Continuing because phone matched.`
    );
  }

  const variants = await prisma.variant.findMany({
    select: { id: true, sku: true, stockAvailable: true, stockReserved: true },
    orderBy: { sku: "asc" },
  });

  let skippedExisting = 0;
  let skippedZero = 0;
  const existingRows = await prisma.partnerInventory.findMany({
    where: { partnerId: partner.id },
    select: { variantId: true },
  });
  const existingVariantIds = new Set(existingRows.map((row) => row.variantId));

  const toCreate = variants.filter((variant) => {
    if (variant.stockAvailable === 0 && variant.stockReserved === 0) {
      skippedZero += 1;
      return false;
    }
    if (existingVariantIds.has(variant.id)) {
      skippedExisting += 1;
      return false;
    }
    return true;
  });

  const result = await prisma.$transaction(
    async (tx) => {
      if (toCreate.length === 0) return { count: 0 };
      const inventoryResult = await tx.partnerInventory.createMany({
        data: toCreate.map((variant) => ({
          partnerId: partner.id,
          variantId: variant.id,
          stockAvailable: variant.stockAvailable,
          stockReserved: variant.stockReserved,
        })),
        skipDuplicates: true,
      });
      if (toCreate.length > 0) {
        await tx.inventoryLedger.createMany({
          data: toCreate.map((variant) => ({
            partnerId: partner.id,
            variantId: variant.id,
            reason: "LEGACY_BACKFILL",
            quantityAvailableDelta: variant.stockAvailable,
            quantityReservedDelta: variant.stockReserved,
            notes: `Legacy Variant stock backfill for SKU ${variant.sku}`,
          })),
        });
      }
      return inventoryResult;
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  const totalAvailable = toCreate.reduce((sum, variant) => sum + variant.stockAvailable, 0);
  const totalReserved = toCreate.reduce((sum, variant) => sum + variant.stockReserved, 0);

  console.log(
    JSON.stringify(
      {
        partnerId: partner.id,
        partnerName: partner.name,
        normalizedPhone,
        created: result.count,
        skippedExisting,
        skippedZero,
        totalAvailableCreated: totalAvailable,
        totalReservedCreated: totalReserved,
      },
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
