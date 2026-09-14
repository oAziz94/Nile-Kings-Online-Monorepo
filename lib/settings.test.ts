import { describe, expect, it, vi } from "vitest";
import { PARTNER_NETWORK_DEFAULTS } from "./partner/settings-schema";

/**
 * `getPartnerNetworkDefaults` fallback (backlog 9.7 (a)) — a fake `SiteSetting` table so the
 * function's own logic (parse-or-fallback, Zod-validate-or-fallback) is exercised without a
 * real DB. `next/cache` is mocked to a passthrough since this module also exports a couple of
 * `unstable_cache`-wrapped functions unrelated to this test.
 */
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => undefined,
}));

const siteSettings = new Map<string, string>();

vi.mock("@/lib/db", () => ({
  get prisma() {
    return {
      siteSetting: {
        findUnique: async ({ where }: { where: { key: string } }) => {
          const value = siteSettings.get(where.key);
          return value === undefined ? null : { value };
        },
        upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
          siteSettings.set(where.key, create.value);
          return { key: where.key, value: create.value };
        },
      },
    };
  },
}));

const { getPartnerNetworkDefaults, setPartnerNetworkDefaults } = await import("./settings");

describe("getPartnerNetworkDefaults", () => {
  it("falls back to PARTNER_NETWORK_DEFAULTS when no row exists yet", async () => {
    siteSettings.clear();
    expect(await getPartnerNetworkDefaults()).toEqual(PARTNER_NETWORK_DEFAULTS);
  });

  it("falls back when the stored row is malformed JSON", async () => {
    siteSettings.clear();
    siteSettings.set("partnerDefaults", "{not json");
    expect(await getPartnerNetworkDefaults()).toEqual(PARTNER_NETWORK_DEFAULTS);
  });

  it("falls back when the stored row fails the Zod bounds", async () => {
    siteSettings.clear();
    siteSettings.set("partnerDefaults", JSON.stringify({ ...PARTNER_NETWORK_DEFAULTS, costRateBps: 99_999 }));
    expect(await getPartnerNetworkDefaults()).toEqual(PARTNER_NETWORK_DEFAULTS);
  });

  it("returns the stored value once saved, and never mutates the fallback constant", async () => {
    siteSettings.clear();
    const changed = { ...PARTNER_NETWORK_DEFAULTS, costRateBps: 7000, confirmSlaHours: 12 };
    await setPartnerNetworkDefaults(changed);
    expect(await getPartnerNetworkDefaults()).toEqual(changed);
    expect(PARTNER_NETWORK_DEFAULTS.costRateBps).toBe(7500);
  });
});
