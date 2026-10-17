/** Backlog 11.1 — POST /api/admin/rerouting-rules/[id]/partners refuses an outlet (DISTRIBUTOR). */
import { describe, it, expect, vi, beforeEach } from "vitest";

const partnerFindUnique = vi.fn();
const linkFindUnique = vi.fn();
const linkCreate = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireAdmin: vi.fn(async () => ({ userId: "a1", role: "ADMIN" })) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    reroutingRule: { findUnique: async () => ({ id: "r1", governorate: "g" }) },
    partner: { findUnique: (...a: unknown[]) => partnerFindUnique(...a) },
    reroutingRulePartner: {
      findUnique: (...a: unknown[]) => linkFindUnique(...a),
      create: (...a: unknown[]) => linkCreate(...a),
    },
  },
}));
vi.mock("@/lib/audit/admin-audit", () => ({ logAdminAction: vi.fn(), requestIp: () => null }));
vi.mock("@/lib/cache/catalog-tags", () => ({ revalidateReroutingRules: vi.fn() }));

import { POST } from "./route";

const call = (partnerId: string) =>
  POST(
    new Request("http://localhost/api/admin/rerouting-rules/r1/partners", {
      method: "POST",
      body: JSON.stringify({ partnerId }),
    }) as never,
    { params: Promise.resolve({ id: "r1" }) }
  );

describe("POST /api/admin/rerouting-rules/[id]/partners", () => {
  beforeEach(() => {
    partnerFindUnique.mockReset();
    linkFindUnique.mockReset();
    linkCreate.mockReset();
    linkFindUnique.mockResolvedValue(null);
  });

  it("answers 400 for a DISTRIBUTOR and creates no link", async () => {
    partnerFindUnique.mockResolvedValue({ id: "p1", partnerType: "DISTRIBUTOR" });
    const res = await call("p1");
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("المنافذ لا تستقبل طلبات أونلاين");
    expect(linkCreate).not.toHaveBeenCalled();
  });

  it("still adds an AGENT", async () => {
    partnerFindUnique.mockResolvedValue({ id: "p2", partnerType: "AGENT" });
    linkCreate.mockResolvedValue({ id: "l1", partnerId: "p2", partner: { name: "A" } });
    const res = await call("p2");
    expect(res.status).toBe(200);
    expect(linkCreate).toHaveBeenCalledTimes(1);
  });
});
