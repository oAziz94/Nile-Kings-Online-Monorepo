import type { ImageLoader } from "next/image";

// Cloudinary transformation parameter keys we recognise when deciding whether
// a path segment after `/image/upload/` is a transformation (vs. part of the
// public id). Kept short and whitelisted on purpose: a public id containing
// an underscore (`product_photo`) must never be mistaken for a transform.
const TRANSFORM_KEYS = new Set([
  "f", "q", "c", "w", "h", "g", "e", "x", "y", "r", "b", "o", "bo", "co",
  "dpr", "ar", "fl", "l", "u", "t", "dl", "a", "vc", "br", "du", "so", "eo", "cs", "dn",
]);

const CLOUDINARY_UPLOAD_RE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;

function keyOf(param: string): string {
  const idx = param.indexOf("_");
  return idx > 0 ? param.slice(0, idx).toLowerCase() : "";
}

function isTransformSegment(segment: string): boolean {
  if (/^v\d+$/i.test(segment)) return false; // version segment, e.g. v1690000000
  const parts = segment.split(",");
  return parts.length > 0 && parts.every((part) => TRANSFORM_KEYS.has(keyOf(part)));
}

/**
 * `next/image` loader for Cloudinary-hosted catalog images (backlog 6.4).
 *
 * For `https://res.cloudinary.com/<cloud>/image/upload/[<transforms>/][v<n>/]<public_id>`
 * URLs, inserts `f_auto,q_auto,c_limit,w_<width>` so Cloudinary serves a
 * right-sized, auto-formatted (WebP/AVIF) asset instead of the original —
 * cutting both Cloudinary bandwidth and Vercel's image-optimization cost,
 * which would otherwise re-fetch and re-encode the same original per size.
 *
 * - A `quality` prop maps to `q_<quality>` instead of `q_auto`.
 * - An existing transformation segment (e.g. `c_fill,g_auto`) is kept as a
 *   second segment, unmodified, after the new one.
 * - A segment that already carries `f_`/`q_`/`w_` (i.e. already run through
 *   this loader) is merged in place — `w_` is replaced, not duplicated.
 * - Any other URL (static `/brand/*` assets, third-party hosts, `data:`
 *   URIs, relative paths) is returned unchanged.
 */
export const cloudinaryLoader: ImageLoader = ({ src, width, quality }) => {
  const match = CLOUDINARY_UPLOAD_RE.exec(src);
  if (!match) return src;

  const [, prefix, rest] = match;
  const segments = rest.split("/");
  const qualityParam = quality ? `q_${quality}` : "q_auto";

  let cursor = 0;
  let transformSegment: string | null = null;
  if (segments[cursor] && isTransformSegment(segments[cursor])) {
    transformSegment = segments[cursor];
    cursor += 1;
  }
  const remaining = segments.slice(cursor);

  if (transformSegment) {
    const params = transformSegment.split(",");
    const hasF = params.some((p) => keyOf(p) === "f");
    const hasQ = params.some((p) => keyOf(p) === "q");
    const hasW = params.some((p) => keyOf(p) === "w");

    if (hasF || hasQ || hasW) {
      // Already processed (by this loader or by hand, the same way): merge
      // in place instead of stacking a second transformation segment.
      const extras = params.filter((p) => !["f", "q", "c", "w"].includes(keyOf(p)));
      const merged = ["f_auto", qualityParam, "c_limit", `w_${width}`, ...extras].join(",");
      return `${prefix}${[merged, ...remaining].join("/")}`;
    }

    // A plain crop/gravity segment with none of our params: prepend ours,
    // keep the existing one untouched right after it.
    const newSegment = ["f_auto", qualityParam, "c_limit", `w_${width}`].join(",");
    return `${prefix}${[newSegment, transformSegment, ...remaining].join("/")}`;
  }

  const newSegment = ["f_auto", qualityParam, "c_limit", `w_${width}`].join(",");
  return `${prefix}${[newSegment, ...remaining].join("/")}`;
};
