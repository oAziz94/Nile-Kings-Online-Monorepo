import { prisma } from "@/lib/db";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function sameDestination(
  a: { governorate: string; city: string | null; area: string | null },
  b: { governorate: string; city: string | null; area: string | null }
): boolean {
  if (norm(a.governorate) !== norm(b.governorate)) return false;
  if (norm(a.city) !== norm(b.city)) return false;
  if (norm(a.area) !== norm(b.area)) return false;
  return true;
}

function weightRangesOverlap(
  a: { weightMin: number; weightMax: number },
  b: { weightMin: number; weightMax: number }
): boolean {
  return a.weightMin <= b.weightMax && b.weightMin <= a.weightMax;
}

export type RuleInput = {
  provider: string;
  governorate: string;
  city?: string | null;
  area?: string | null;
  weightMin: number;
  weightMax: number;
  id?: string; // exclude self when updating
};

/**
 * Returns list of existing rule ids that overlap with the given rule (same provider + destination + overlapping weight).
 */
export async function findOverlappingRules(input: RuleInput): Promise<{ id: string; priority: number }[]> {
  const rules = await prisma.shippingRule.findMany({
    where: {
      provider: { equals: input.provider, mode: "insensitive" },
      governorate: { equals: input.governorate, mode: "insensitive" },
      ...(input.id && { id: { not: input.id } }),
    },
    select: { id: true, governorate: true, city: true, area: true, weightMin: true, weightMax: true, priority: true },
  });

  const dest = {
    governorate: input.governorate,
    city: input.city ?? null,
    area: input.area ?? null,
  };
  const overlapping: { id: string; priority: number }[] = [];
  for (const r of rules) {
    if (!sameDestination(dest, { governorate: r.governorate, city: r.city, area: r.area })) continue;
    if (!weightRangesOverlap({ weightMin: input.weightMin, weightMax: input.weightMax }, { weightMin: r.weightMin, weightMax: r.weightMax })) continue;
    overlapping.push({ id: r.id, priority: r.priority });
  }
  return overlapping;
}
