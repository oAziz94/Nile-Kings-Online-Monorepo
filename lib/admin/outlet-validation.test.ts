import { describe, expect, it } from "vitest";
import { OUTLET_NO_AGENT_MESSAGE, outletLinkedAgentError } from "./outlet-validation";

describe("outletLinkedAgentError", () => {
  it("refuses a linked agent for a DISTRIBUTOR", () => {
    expect(outletLinkedAgentError("DISTRIBUTOR", "agent-1")).toBe(OUTLET_NO_AGENT_MESSAGE);
    expect(OUTLET_NO_AGENT_MESSAGE).toBe("المنفذ لا يرتبط بوكيل");
  });
  it("accepts an outlet with no / blank / null agent", () => {
    expect(outletLinkedAgentError("DISTRIBUTOR", null)).toBeNull();
    expect(outletLinkedAgentError("DISTRIBUTOR", undefined)).toBeNull();
    expect(outletLinkedAgentError("DISTRIBUTOR", "  ")).toBeNull();
  });
  it("does not judge agents (their own rules live in the routes)", () => {
    expect(outletLinkedAgentError("AGENT", "agent-1")).toBeNull();
  });
});
