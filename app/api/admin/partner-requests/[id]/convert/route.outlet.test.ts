/** Backlog 11.6 (d) — converting an outlet request refuses ?linkedAgentId. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const reqFind = vi.fn();
const partnerCreate = vi.fn();
vi.mock("@/lib/auth/session", () => ({ requireAdmin: vi.fn(async () => ({ userId: "a1", role: "ADMIN" })) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    partnerRequest: { findUnique: (...a: unknown[]) => reqFind(...a), update: vi.fn() },
    partner: { create: (...a: unknown[]) => partnerCreate(...a), findFirst: vi.fn() },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
vi.mock("@/lib/audit/admin-audit", () => ({ logAdminAction: vi.fn(), requestIp: () => null, sanitizeForAudit: (x: unknown) => x }));
vi.mock("@/lib/settings", () => ({
  getPartnerNetworkDefaults: async () => ({
    confirmSlaHours: 4, shipSlaHours: 24, costRateBps: 6000, lowStockThreshold: 5, deadStockDays: 60, targetCoverDays: 30,
  }),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const call = (qs: string) =>
  POST(new NextRequest(`http://localhost/api/admin/partner-requests/r1/convert${qs}`, { method: "POST" }), {
    params: Promise.resolve({ id: "r1" }),
  });

describe("POST /api/admin/partner-requests/[id]/convert (outlets)", () => {
  beforeEach(() => {
    partnerCreate.mockReset();
    partnerCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", name: "x", ...data }));
    reqFind.mockResolvedValue({ id: "r1", requestType: "DISTRIBUTOR", name: "منفذ", governorate: "الجيزة", phone: "01012345678" });
  });

  it("400 المنفذ لا يرتبط بوكيل with a linkedAgentId", async () => {
    const res = await call("?linkedAgentId=agent-1");
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("المنفذ لا يرتبط بوكيل");
    expect(partnerCreate).not.toHaveBeenCalled();
  });

  it("converts without an agent", async () => {
    const res = await call("");
    expect(res.status).toBe(200);
    expect(partnerCreate.mock.calls[0][0].data.linkedAgentId).toBeNull();
  });
});
