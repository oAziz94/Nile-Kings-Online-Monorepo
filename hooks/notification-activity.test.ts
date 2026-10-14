import { describe, it, expect } from "vitest";
import { pollIntervalFor, POLL_MS, IDLE_AFTER_MS } from "./notification-activity";

describe("pollIntervalFor", () => {
  it("polls every 20 s while active, stops at the 30 min idle boundary", () => {
    expect(pollIntervalFor(1_000, 1_000)).toBe(POLL_MS);
    expect(pollIntervalFor(1_000, 1_000 + IDLE_AFTER_MS - 1)).toBe(POLL_MS);
    expect(pollIntervalFor(1_000, 1_000 + IDLE_AFTER_MS)).toBe(false);
    expect(pollIntervalFor(1_000, 1_000 + IDLE_AFTER_MS * 10)).toBe(false);
  });
});
