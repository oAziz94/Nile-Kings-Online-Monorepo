import { describe, expect, it, vi } from "vitest";
import { deleteByIds, definedIds, safeWhere } from "./db-cleanup";

describe("definedIds", () => {
  it("drops undefined, null and empty-string entries", () => {
    expect(definedIds(["a", undefined, null, "", "b"])).toEqual(["a", "b"]);
  });

  it("returns an empty array when nothing is defined", () => {
    expect(definedIds([undefined, null, undefined])).toEqual([]);
  });
});

describe("safeWhere", () => {
  it("throws when a top-level value is undefined", () => {
    expect(() => safeWhere({ variantId: undefined })).toThrow("unsafe cleanup filter: variantId is undefined");
  });

  it("throws on an empty object", () => {
    expect(() => safeWhere({})).toThrow("unsafe cleanup filter: where is empty");
  });

  it("returns the where object unchanged when every value is defined", () => {
    const where = { variantId: "v1", partnerId: "p1" };
    expect(safeWhere(where)).toBe(where);
  });
});

describe("deleteByIds", () => {
  it("is a no-op (calls nothing) when every id is undefined", async () => {
    const deleteMany = vi.fn();
    await deleteByIds({ deleteMany }, [undefined]);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("is a no-op when the list is empty", async () => {
    const deleteMany = vi.fn();
    await deleteByIds({ deleteMany }, []);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("calls deleteMany once with the defined ids under `in`", async () => {
    const deleteMany = vi.fn().mockResolvedValue(undefined);
    await deleteByIds({ deleteMany }, ["a", "b"]);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] } } });
  });

  it("filters out undefined ids before calling deleteMany", async () => {
    const deleteMany = vi.fn().mockResolvedValue(undefined);
    await deleteByIds({ deleteMany }, ["a", undefined, "b", null]);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] } } });
  });

  it("honours a custom field name", async () => {
    const deleteMany = vi.fn().mockResolvedValue(undefined);
    await deleteByIds({ deleteMany }, ["v1"], "variantId");
    expect(deleteMany).toHaveBeenCalledWith({ where: { variantId: { in: ["v1"] } } });
  });
});
