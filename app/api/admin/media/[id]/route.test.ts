/**
 * Backlog 10.43 — DELETE /api/admin/media/[id] is idempotent: a row removed by a concurrent
 * request between the lookup and the delete answers 200 `alreadyDeleted`, never a P2025 500,
 * and writes no second audit row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const deleteMany = vi.fn();
const logAdminAction = vi.fn();
const destroy = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireAdmin: vi.fn(async () => ({ userId: "a1", role: "ADMIN" })) }));
vi.mock("@/lib/db", () => ({
  prisma: { mediaAsset: { findUnique: (...a: unknown[]) => findUnique(...a), deleteMany: (...a: unknown[]) => deleteMany(...a) } },
}));
vi.mock("@/lib/audit/admin-audit", () => ({
  logAdminAction: (...a: unknown[]) => logAdminAction(...a),
  requestIp: () => null,
}));
vi.mock("@/lib/media/usage", () => ({ getAssetUsage: vi.fn(async () => new Map()), summarizeUsage: () => "" }));
vi.mock("@/lib/media/cloudinary-admin", () => ({ destroyCloudinaryAsset: (...a: unknown[]) => destroy(...a) }));

import { DELETE } from "./route";

const call = () =>
  DELETE(new Request("http://localhost/api/admin/media/m1", { method: "DELETE" }) as never, { params: Promise.resolve({ id: "m1" }) });

describe("DELETE /api/admin/media/[id]", () => {
  beforeEach(() => {
    findUnique.mockReset();
    deleteMany.mockReset();
    logAdminAction.mockReset();
    destroy.mockReset();
    findUnique.mockResolvedValue({ id: "m1", url: "u", publicId: "nile-kings/products/e2e-x/a", deletedAt: null });
    destroy.mockResolvedValue("ok");
  });

  it("deletes once and audits", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: "m1" });
    expect(logAdminAction).toHaveBeenCalledTimes(1);
  });

  it("answers 200 alreadyDeleted with no audit row when deleteMany removes nothing", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: "m1", alreadyDeleted: true });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("still 404s an id that never existed", async () => {
    findUnique.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("treats a Cloudinary 'not found' as success", async () => {
    destroy.mockResolvedValue("not found");
    deleteMany.mockResolvedValue({ count: 1 });
    expect((await call()).status).toBe(200);
  });
});
