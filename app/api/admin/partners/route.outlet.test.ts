/** Backlog 11.6 (d) — POST /api/admin/partners refuses a linked agent for an outlet. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
vi.mock("@/lib/auth/session", () => ({ requireAdmin: vi.fn(async () => ({ userId: "a1", role: "ADMIN" })) }));
vi.mock("@/lib/db", () => ({ prisma: { partner: { create: (...a: unknown[]) => create(...a), findFirst: vi.fn() } } }));
vi.mock("@/lib/audit/admin-audit", () => ({ logAdminAction: vi.fn(), requestIp: () => null, sanitizeForAudit: (x: unknown) => x }));
vi.mock("@/lib/settings", () => ({
  getPartnerNetworkDefaults: async () => ({
    confirmSlaHours: 4, shipSlaHours: 24, costRateBps: 6000, lowStockThreshold: 5, deadStockDays: 60, targetCoverDays: 30,
  }),
}));
vi.mock("@/lib/admin/partners-list", () => ({ computePartnersHealth: vi.fn() }));

import { POST } from "./route";

const call = (body: Record<string, unknown>) =>
  POST(new Request("http://localhost/api/admin/partners", { method: "POST", body: JSON.stringify(body) }) as never);

const base = { name: "منفذ", governorate: "القاهرة", phone: "01012345678" };

describe("POST /api/admin/partners (outlets)", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", ...data }));
  });

  it("400 المنفذ لا يرتبط بوكيل when a DISTRIBUTOR carries linkedAgentId", async () => {
    const res = await call({ ...base, partnerType: "DISTRIBUTOR", linkedAgentId: "agent-1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("المنفذ لا يرتبط بوكيل");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates an outlet with no agent", async () => {
    const res = await call({ ...base, partnerType: "DISTRIBUTOR", linkedAgentId: null });
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0].data.linkedAgentId).toBeNull();
    expect(create.mock.calls[0][0].data.partnerType).toBe("DISTRIBUTOR");
  });
});
