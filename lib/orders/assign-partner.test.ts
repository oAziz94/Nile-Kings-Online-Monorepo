import { describe, expect, it } from "vitest";
import { decideAssignmentAction } from "./assign-partner";

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
