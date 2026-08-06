import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const GAMAL_PHONE = "01062508999";

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

  const allPartners = await prisma.partner.findMany({
    orderBy: { createdAt: "asc" },
  });
  const partners = allPartners.filter(
    (partner) => normalizeEgyptMobilePhoneForScript(partner.phone) === normalizedPhone
  );
  if (partners.length !== 1) {
    throw new Error(`Expected exactly one partner for ${normalizedPhone}; found ${partners.length}`);
  }
  const partner = partners[0]!;

  const variants = await prisma.variant.findMany({
    select: { id: true, sku: true, stockAvailable: true, stockReserved: true },
    orderBy: { sku: "asc" },
  });
  const inventory = await prisma.partnerInventory.findMany({
    where: { partnerId: partner.id },
    select: { variantId: true, stockAvailable: true, stockReserved: true },
  });
  const byVariant = new Map(inventory.map((row) => [row.variantId, row]));

  const mismatches = variants
    .map((variant) => {
      const row = byVariant.get(variant.id);
      return {
        variantId: variant.id,
        sku: variant.sku,
        legacyAvailable: variant.stockAvailable,
        legacyReserved: variant.stockReserved,
        partnerAvailable: row?.stockAvailable ?? 0,
        partnerReserved: row?.stockReserved ?? 0,
      };
    })
    .filter(
      (row) =>
        row.legacyAvailable !== row.partnerAvailable ||
        row.legacyReserved !== row.partnerReserved
    );

  const legacyTotals = variants.reduce(
    (totals, variant) => {
      totals.available += variant.stockAvailable;
      totals.reserved += variant.stockReserved;
      return totals;
    },
    { available: 0, reserved: 0 }
  );
  const partnerTotals = inventory.reduce(
    (totals, row) => {
      totals.available += row.stockAvailable;
      totals.reserved += row.stockReserved;
      return totals;
    },
    { available: 0, reserved: 0 }
  );

  const result = {
    ok: mismatches.length === 0,
    partnerId: partner.id,
    partnerName: partner.name,
    normalizedPhone,
    legacyTotals,
    partnerTotals,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 50),
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
