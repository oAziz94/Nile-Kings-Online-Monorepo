import { describe, it, expect } from "vitest";
import { computeSyncDiff, computeAdoptionMatches } from "./sync";

describe("computeSyncDiff", () => {
  it("imports resources present in Cloudinary but not registered", () => {
    const diff = computeSyncDiff(
      [
        { public_id: "nile-kings/products/a", secure_url: "https://x/a.jpg" },
        { public_id: "nile-kings/products/b", secure_url: "https://x/b.jpg" },
      ],
      [{ publicId: "nile-kings/products/a" }]
    );
    expect(diff.toImport.map((r) => r.public_id)).toEqual(["nile-kings/products/b"]);
    expect(diff.missingPublicIds).toEqual([]);
  });

  it("flags a registered asset as missing when its resource is gone", () => {
    const diff = computeSyncDiff(
      [{ public_id: "nile-kings/products/a", secure_url: "https://x/a.jpg" }],
      [{ publicId: "nile-kings/products/a" }, { publicId: "nile-kings/products/gone" }]
    );
    expect(diff.toImport).toEqual([]);
    expect(diff.missingPublicIds).toEqual(["nile-kings/products/gone"]);
  });

  it("both directions in one listing", () => {
    const diff = computeSyncDiff(
      [
        { public_id: "a", secure_url: "https://x/a.jpg" },
        { public_id: "new", secure_url: "https://x/new.jpg" },
      ],
      [{ publicId: "a" }, { publicId: "gone" }]
    );
    expect(diff.toImport.map((r) => r.public_id)).toEqual(["new"]);
    expect(diff.missingPublicIds).toEqual(["gone"]);
  });

  it("empty listing marks every registered asset missing", () => {
    const diff = computeSyncDiff([], [{ publicId: "a" }, { publicId: "b" }]);
    expect(diff.missingPublicIds.sort()).toEqual(["a", "b"]);
  });
});

describe("computeAdoptionMatches", () => {
  it("matches legacy rows whose url equals a registered asset's url", () => {
    const matches = computeAdoptionMatches(
      [
        { id: "product-1", url: "https://x/a.jpg" },
        { id: "product-2", url: "https://x/unrelated.jpg" },
      ],
      new Map([["https://x/a.jpg", "asset-1"]])
    );
    expect(matches).toEqual([{ rowId: "product-1", assetId: "asset-1" }]);
  });

  it("no matches when no url overlaps", () => {
    const matches = computeAdoptionMatches(
      [{ id: "p1", url: "https://x/z.jpg" }],
      new Map([["https://x/a.jpg", "asset-1"]])
    );
    expect(matches).toEqual([]);
  });
});
