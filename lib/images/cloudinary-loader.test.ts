import { describe, it, expect } from "vitest";
import { cloudinaryOriginSrc, ORIGIN_MAX_WIDTH } from "./cloudinary-loader";

describe("cloudinaryOriginSrc (backlog 10.42)", () => {
  it("caps a plain upload URL at f_webp,q_auto,c_limit,w_1600", () => {
    expect(ORIGIN_MAX_WIDTH).toBe(1600);
    expect(cloudinaryOriginSrc("https://res.cloudinary.com/demo/image/upload/sample.jpg")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_webp,q_auto,c_limit,w_1600/sample.jpg"
    );
  });

  it("keeps the version segment", () => {
    expect(cloudinaryOriginSrc("https://res.cloudinary.com/demo/image/upload/v1690000000/sample.jpg")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_webp,q_auto,c_limit,w_1600/v1690000000/sample.jpg"
    );
  });

  it("replaces a 6.4-era f_auto,q_auto,c_limit,w_<n> segment in place (no double width)", () => {
    expect(
      cloudinaryOriginSrc("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_256/sample.jpg")
    ).toBe("https://res.cloudinary.com/demo/image/upload/f_webp,q_auto,c_limit,w_1600/sample.jpg");
  });

  it("is idempotent", () => {
    const once = cloudinaryOriginSrc("https://res.cloudinary.com/demo/image/upload/c_fill,g_auto/v42/sample.jpg");
    expect(once).toBe("https://res.cloudinary.com/demo/image/upload/f_webp,q_auto,c_limit,w_1600/c_fill,g_auto/v42/sample.jpg");
    expect(cloudinaryOriginSrc(once)).toBe(once);
  });

  it("leaves non-Cloudinary, local and data: sources unchanged", () => {
    for (const src of [
      "https://example.com/photo-123?w=400",
      "/brand/storefront/cotton-field.jpg",
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    ]) {
      expect(cloudinaryOriginSrc(src)).toBe(src);
    }
  });
});
