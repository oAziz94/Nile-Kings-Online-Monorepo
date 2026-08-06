import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeEgyptMobilePhoneForScript(input: string): string | null {
  const ascii = input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const digits = ascii.replace(/\D/g, "");
  if (/^01[0125]\d{8}$/.test(digits)) return `+2${digits}`;
  if (/^201[0125]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

async function main() {
  const phoneArg = process.argv[2];
  const expectedName = process.argv.slice(3).join(" ").trim() || null;
  if (!phoneArg) {
    throw new Error("Usage: npx tsx scripts/ensure-partner-account.ts <phone> [expected name]");
  }

  const targetPhone = normalizeEgyptMobilePhoneForScript(phoneArg);
  if (!targetPhone) throw new Error(`Invalid Egyptian mobile phone: ${phoneArg}`);

  const [users, partners] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, phone: true, role: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.partner.findMany({
      select: { id: true, phone: true, partnerType: true, name: true, userId: true, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const matchingUsers = users.filter((user) => normalizeEgyptMobilePhoneForScript(user.phone) === targetPhone);
  const matchingPartners = partners.filter(
    (partner) => normalizeEgyptMobilePhoneForScript(partner.phone) === targetPhone
  );

  if (matchingUsers.length !== 1) {
    throw new Error(`Expected exactly one User for ${targetPhone}; found ${matchingUsers.length}`);
  }
  if (matchingPartners.length !== 1) {
    throw new Error(`Expected exactly one Partner for ${targetPhone}; found ${matchingPartners.length}`);
  }

  const user = matchingUsers[0]!;
  const partner = matchingPartners[0]!;
  const nameCheck =
    expectedName && !partner.name.includes(expectedName) && !user.name?.includes(expectedName)
      ? `Expected name "${expectedName}" did not match user/partner names`
      : null;
  if (nameCheck) throw new Error(nameCheck);

  const result = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: { role: "PARTNER" },
      select: { id: true, phone: true, role: true, name: true },
    });

    const updatedPartner =
      partner.userId === user.id
        ? partner
        : await tx.partner.update({
            where: { id: partner.id },
            data: { userId: user.id },
            select: { id: true, phone: true, partnerType: true, name: true, userId: true, isActive: true },
          });

    return { updatedUser, updatedPartner };
  });

  console.log(
    JSON.stringify(
      {
        targetPhone,
        user: result.updatedUser,
        partner: result.updatedPartner,
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
