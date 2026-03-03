/**
 * Senior verification: validate Egyptian ID, check fingerprint unique, store encrypted.
 */

import { prisma } from "@/lib/db";
import { parseEgyptianNationalId, normalizeNationalId, maskNationalIdLast4 } from "./egypt-id";
import { encryptNationalId, nationalIdFingerprint } from "./encrypt";

export type VerifyResult =
  | { success: true; last4: string }
  | { success: false; error: string; code?: string };

export async function verifyAndStoreSeniorId(
  userId: string,
  nationalIdRaw: string
): Promise<VerifyResult> {
  const normalized = normalizeNationalId(nationalIdRaw);
  if (normalized.length !== 14) {
    return { success: false, error: "رقم الهوية يجب أن يكون 14 رقماً" };
  }

  const parsed = parseEgyptianNationalId(normalized);
  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }

  const fingerprint = await nationalIdFingerprint(normalized);
  const existing = await prisma.seniorVerification.findUnique({
    where: { nationalIdFingerprint: fingerprint },
    select: { userId: true },
  });
  if (existing) {
    if (existing.userId === userId) {
      return { success: false, error: "تم التحقق من هذا الرقم مسبقاً لهذا الحساب", code: "ALREADY_VERIFIED" };
    }
    return { success: false, error: "رقم الهوية مستخدم لحساب آخر", code: "ID_IN_USE" };
  }

  const encrypted = await encryptNationalId(normalized);
  const last4 = maskNationalIdLast4(normalized);

  await prisma.$transaction([
    prisma.seniorVerification.upsert({
      where: { userId },
      create: {
        userId,
        nationalIdEncrypted: encrypted,
        nationalIdFingerprint: fingerprint,
        nationalIdLast4: last4,
      },
      update: {
        nationalIdEncrypted: encrypted,
        nationalIdFingerprint: fingerprint,
        nationalIdLast4: last4,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { seniorVerified: true },
    }),
  ]);

  return { success: true, last4 };
}

export async function getSeniorStatus(userId: string): Promise<{
  seniorVerified: boolean;
  nationalIdLast4: string | null;
}> {
  try {
    const verification = await prisma.seniorVerification.findUnique({
      where: { userId },
      select: { nationalIdLast4: true },
    });
    if (!verification) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { seniorVerified: true },
      });
      return { seniorVerified: user?.seniorVerified ?? false, nationalIdLast4: null };
    }
    return { seniorVerified: true, nationalIdLast4: verification.nationalIdLast4 };
  } catch (e: unknown) {
    // P2021 = table does not exist (migration not run yet)
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2021") {
      return { seniorVerified: false, nationalIdLast4: null };
    }
    throw e;
  }
}
