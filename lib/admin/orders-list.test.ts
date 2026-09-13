import { describe, expect, it } from "vitest";
import { parseStage, stageWhereClause } from "./orders-list";

describe("parseStage", () => {
  it("empty/unknown → all", () => {
    expect(parseStage(undefined)).toBe("");
    expect(parseStage("")).toBe("");
    expect(parseStage("bogus")).toBe("");
  });

  it("recognises UNASSIGNED case-insensitively", () => {
    expect(parseStage("UNASSIGNED")).toBe("UNASSIGNED");
    expect(parseStage("unassigned")).toBe("UNASSIGNED");
  });

  it("recognises a real order status", () => {
    expect(parseStage("CONFIRMED")).toBe("CONFIRMED");
    expect(parseStage("cancelled")).toBe("CANCELLED");
  });
});

describe("stageWhereClause", () => {
  it("\"\" (الكل) has no extra clause", () => {
    expect(stageWhereClause("")).toEqual({});
  });

  it("UNASSIGNED (بلا شريك) excludes terminal statuses", () => {
    expect(stageWhereClause("UNASSIGNED")).toEqual({
      assignedPartnerId: null,
      status: { notIn: ["DELIVERED", "CANCELLED"] },
    });
  });

  it("a real status filters by status only", () => {
    expect(stageWhereClause("PROCESSING")).toEqual({ status: "PROCESSING" });
  });
});
