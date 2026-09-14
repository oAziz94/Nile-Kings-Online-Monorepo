import { describe, it, expect } from "vitest";
import { computeSyncDiff, computeAdoptionMatches, missingFromSeen } from "./sync";

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

describe("missingFromSeen (verifier fix 5 — resumable sync)", () => {
  it("matches computeSyncDiff's missing detection when given the same listing in one shot", () => {
    const resources = [
      { public_id: "nile-kings/products/a", secure_url: "https://x/a.jpg" },
      { public_id: "nile-kings/products/c", secure_url: "https://x/c.jpg" },
    ];
    const registered = [{ publicId: "nile-kings/products/a" }, { publicId: "nile-kings/products/b" }, { publicId: "nile-kings/products/c" }];

    const oneShot = computeSyncDiff(resources, registered).missingPublicIds;
    const viaSeen = missingFromSeen(registered, resources.map((r) => r.public_id));
    expect(viaSeen).toEqual(oneShot);
    expect(viaSeen).toEqual(["nile-kings/products/b"]);
  });

  it("a listing split across several resumed pages yields the same import/missing totals as one pass", () => {
    // Simulates the route's resumable loop: three "pages" (as if fetched across three 45s-
    // budgeted requests) instead of one full listing in a single call.
    const page1 = [
      { public_id: "p/1", secure_url: "https://x/1.jpg" },
      { public_id: "p/2", secure_url: "https://x/2.jpg" },
    ];
    const page2 = [
      { public_id: "p/3", secure_url: "https://x/3.jpg" }, // new, unregistered
    ];
    const page3 = [
      { public_id: "p/4", secure_url: "https://x/4.jpg" },
    ];
    const registered = [{ publicId: "p/1" }, { publicId: "p/2" }, { publicId: "p/4" }, { publicId: "p/gone" }];

    // One pass: the whole listing available at once.
    const onePass = computeSyncDiff([...page1, ...page2, ...page3], registered);

    // Split across pages: import decided per-page against the running registered set (as the
    // route does), missing decided once from the accumulated seen set (as `missingFromSeen`
    // does) — never per-page.
    const registeredIds = new Set(registered.map((r) => r.publicId));
    const seen: string[] = [];
    const imported: string[] = [];
    for (const page of [page1, page2, page3]) {
      for (const r of page) {
        seen.push(r.public_id);
        if (!registeredIds.has(r.public_id)) {
          imported.push(r.public_id);
          registeredIds.add(r.public_id);
        }
      }
    }
    const splitMissing = missingFromSeen(registered, seen);

    expect(imported.sort()).toEqual(onePass.toImport.map((r) => r.public_id).sort());
    expect(splitMissing.sort()).toEqual(onePass.missingPublicIds.sort());
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
