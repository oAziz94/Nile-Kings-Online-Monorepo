import { describe, expect, it } from "vitest";
import { close, nextStatusAfterAdminMessage, nextStatusAfterCustomerMessage } from "./order-ticket";

describe("nextStatusAfterCustomerMessage", () => {
  it("stays OPEN when already OPEN", () => {
    expect(nextStatusAfterCustomerMessage("OPEN")).toBe("OPEN");
  });

  it("reopens to OPEN from ANSWERED", () => {
    expect(nextStatusAfterCustomerMessage("ANSWERED")).toBe("OPEN");
  });

  it("reopens to OPEN from CLOSED", () => {
    expect(nextStatusAfterCustomerMessage("CLOSED")).toBe("OPEN");
  });
});

describe("nextStatusAfterAdminMessage", () => {
  it("moves OPEN to ANSWERED", () => {
    expect(nextStatusAfterAdminMessage("OPEN")).toBe("ANSWERED");
  });

  it("stays ANSWERED when already ANSWERED", () => {
    expect(nextStatusAfterAdminMessage("ANSWERED")).toBe("ANSWERED");
  });

  it("re-answers a CLOSED ticket", () => {
    expect(nextStatusAfterAdminMessage("CLOSED")).toBe("ANSWERED");
  });
});

describe("close", () => {
  it("returns CLOSED with the given timestamp", () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    expect(close(now)).toEqual({ status: "CLOSED", closedAt: now });
  });

  it("defaults to the current time", () => {
    const before = Date.now();
    const result = close();
    const after = Date.now();
    expect(result.status).toBe("CLOSED");
    expect(result.closedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.closedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
