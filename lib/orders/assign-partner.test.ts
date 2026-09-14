import { describe, expect, it } from "vitest";
import { decideAssignmentAction } from "./assign-partner";
import type { OrderStatus } from "@prisma/client";
import { orderUsesPartnerReservationOnly } from "@/lib/inventory/partner-inventory";

describe("decideAssignmentAction", () => {
  it("refuses a delivered order", () => {
    expect(decideAssignmentAction("DELIVERED", false)).toEqual({
      kind: "refuse",
      reason: "لا يمكن إسناد طلب مُسلَّم أو ملغي",
    });
    expect(decideAssignmentAction("DELIVERED", true)).toEqual({
      kind: "refuse",
      reason: "لا يمكن إسناد طلب مُسلَّم أو ملغي",
    });
  });

  it("refuses a cancelled order", () => {
    expect(decideAssignmentAction("CANCELLED", false).kind).toBe("refuse");
  });

  it("chooses \"assign\" when there is no existing routed order", () => {
    expect(decideAssignmentAction("CREATED", false)).toEqual({ kind: "assign" });
    expect(decideAssignmentAction("CONFIRMED", false)).toEqual({ kind: "assign" });
  });

  it("chooses \"reassign\" when a routed order already exists", () => {
    expect(decideAssignmentAction("CREATED", true)).toEqual({ kind: "reassign" });
    expect(decideAssignmentAction("SHIPPED", true)).toEqual({ kind: "reassign" });
  });
});

/**
 * Regression for the verifier-found bug (9.3 rework #1): `assignOrderToPartner`'s first-time
 * "assign" branch decides whether to also commit the fresh reservation via exactly this
 * check — `orderUsesPartnerReservationOnly` — the same one `reassignReservedPartnerStock`
 * already used for its own new-partner side. A CREATED order stays reservation-only (no
 * commit yet, the partner hasn't confirmed); anything past CREATED must commit immediately,
 * or the order's stock sits half-reserved forever with no future write ever settling it.
 */
describe("orderUsesPartnerReservationOnly drives assignOrderToPartner's commit-on-assign step", () => {
  it("CREATED stays reservation-only — assignOrderToPartner must NOT commit", () => {
    expect(orderUsesPartnerReservationOnly("CREATED")).toBe(true);
  });

  it("CONFIRMED/PROCESSING/READY_TO_SHIP/SHIPPED/DELIVERED must commit on first assign", () => {
    for (const status of ["CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED"] as OrderStatus[]) {
      expect(orderUsesPartnerReservationOnly(status)).toBe(false);
    }
  });
});
