/**
 * Backlog 10.49 — server-side guard: place-order refuses (400 LOCATION_MISMATCH) when the
 * address governorate differs from the storefront (cookie) governorate, so a stale client can
 * never route an order to a partner of the wrong governorate. placeOrder itself is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const placeOrder = vi.fn();
const getContext = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireCustomer: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/checkout/place-order", () => ({ placeOrder: (...a: unknown[]) => placeOrder(...a) }));
vi.mock("@/lib/rerouting/assign", () => ({ assignOrderToGovernorate: vi.fn(async () => {}) }));
vi.mock("@/lib/storefront-location", () => ({ getCurrentStorefrontStockContext: () => getContext() }));
vi.mock("@/lib/api/with-api-handler", () => ({ withApiHandler: (fn: unknown) => fn }));

import { POST } from "./route";

function request(governorate: string) {
  return new Request("http://localhost/api/checkout/place-order", {
    method: "POST",
    body: JSON.stringify({
      address: { governorate, city: "بيلا", area: "بيلا", street: "شارع 1", phone: "01099912345" },
      paymentMethod: "COD",
    }),
  });
}

describe("POST /api/checkout/place-order location guard", () => {
  beforeEach(() => {
    placeOrder.mockReset();
    placeOrder.mockResolvedValue({ success: true, orderId: "o1", status: "CREATED" });
    getContext.mockReset();
  });

  it("returns 400 LOCATION_MISMATCH and never places the order when governorates differ", async () => {
    getContext.mockResolvedValue({ governorate: "القاهرة", partnerId: "p_cairo" });
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(request("كفر الشيخ"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("LOCATION_MISMATCH");
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("places the order with the cookie partner when governorates agree", async () => {
    getContext.mockResolvedValue({ governorate: "كفر الشيخ", partnerId: "p_kfs" });
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(request("كفر الشيخ"));
    expect(res.status).toBe(200);
    expect(placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ selectedPartnerId: "p_kfs", selectedGovernorate: "كفر الشيخ" })
    );
  });

  it("still reports GOVERNORATE_NOT_SELECTED when there is no storefront governorate", async () => {
    getContext.mockResolvedValue({ governorate: null, partnerId: null });
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(request("كفر الشيخ"));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("GOVERNORATE_NOT_SELECTED");
    expect(placeOrder).not.toHaveBeenCalled();
  });
});
