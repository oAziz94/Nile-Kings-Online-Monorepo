/** Backlog 11.6 (d) — POST /api/admin/partners ignores a stray linkedAgentId (the field was removed in 11.8). */
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

  it("ignores a linkedAgentId sent by an old client and never writes it", async () => {
    const res = await call({ ...base, partnerType: "DISTRIBUTOR", linkedAgentId: "agent-1" });
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0].data).not.toHaveProperty("linkedAgentId");
  });

  it("creates an outlet with no agent", async () => {
    const res = await call({ ...base, partnerType: "DISTRIBUTOR" });
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0].data.partnerType).toBe("DISTRIBUTOR");
  });
});
