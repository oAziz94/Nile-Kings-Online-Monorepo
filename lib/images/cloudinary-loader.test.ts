import { describe, it, expect } from "vitest";
import { cloudinaryLoader } from "./cloudinary-loader";

describe("cloudinaryLoader", () => {
  it("adds f_auto,q_auto,c_limit,w_<width> to a plain upload URL", () => {
    const out = cloudinaryLoader({
      src: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      width: 640,
    });
    expect(out).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_640/sample.jpg"
    );
  });

  it("keeps the version segment and inserts the transformation before it", () => {
    const out = cloudinaryLoader({
      src: "https://res.cloudinary.com/demo/image/upload/v1690000000/sample.jpg",
      width: 828,
    });
    expect(out).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_828/v1690000000/sample.jpg"
    );
  });

  it("keeps an existing transformation segment after the new one, unmodified", () => {
    const out = cloudinaryLoader({
      src: "https://res.cloudinary.com/demo/image/upload/c_fill,g_auto/v42/sample.jpg",
      width: 384,
    });
    expect(out).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_384/c_fill,g_auto/v42/sample.jpg"
    );
  });

  it("replaces w_ in place instead of duplicating a segment that already carries f_/q_/w_", () => {
    const out = cloudinaryLoader({
      src: "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_256/sample.jpg",
      width: 1080,
    });
    expect(out).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1080/sample.jpg"
    );
  });

  it("merges in place when only w_ is present, preserving unrelated params", () => {
    const out = cloudinaryLoader({
      src: "https://res.cloudinary.com/demo/image/upload/w_200,g_auto/sample.jpg",
      width: 750,
    });
    expect(out).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_750,g_auto/sample.jpg"
    );
  });

  it("maps a given quality to q_<quality> instead of q_auto", () => {
    const out = cloudinaryLoader({
      src: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      width: 640,
      quality: 75,
    });
    expect(out).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_75,c_limit,w_640/sample.jpg"
    );
  });

  it("leaves a non-Cloudinary URL unchanged", () => {
    const src = "https://images.unsplash.com/photo-123?w=400&h=400&fit=crop";
    expect(cloudinaryLoader({ src, width: 640 })).toBe(src);
  });

  it("leaves a local /brand/ path unchanged", () => {
    const src = "/brand/storefront/cotton-field.jpg";
    expect(cloudinaryLoader({ src, width: 640 })).toBe(src);
  });

  it("leaves a data: URL unchanged", () => {
    const src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    expect(cloudinaryLoader({ src, width: 640 })).toBe(src);
  });
});
