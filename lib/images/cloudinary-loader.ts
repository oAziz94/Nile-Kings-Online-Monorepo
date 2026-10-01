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

/** Backlog 10.42 — the largest copy Vercel's optimizer ever fetches from Cloudinary. Every
 * storefront frame renders well under this (PDP main frame maxes at 640px CSS, so 1280px at
 * 2× DPR); the cap exists so the one origin fetch per size is a few hundred KB, not a
 * multi-megabyte phone photo. */
export const ORIGIN_MAX_WIDTH = 1600;

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
 * Inserts `ours` as the first transformation segment of a Cloudinary upload URL.
 *
 * - An existing transformation segment (e.g. `c_fill,g_auto`) is kept as a
 *   second segment, unmodified, after the new one.
 * - A segment that already carries `f_`/`q_`/`w_` (i.e. already run through
 *   one of the helpers below) is merged in place — `w_` is replaced, not duplicated.
 * - Any other URL (static `/brand/*` assets, third-party hosts, `data:`
 *   URIs, relative paths) is returned unchanged.
 */
function withTransform(src: string, ours: string[]): string {
  const match = CLOUDINARY_UPLOAD_RE.exec(src);
  if (!match) return src;

  const [, prefix, rest] = match;
  const segments = rest.split("/");

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
      // Already processed (by a helper here or by hand, the same way): merge
      // in place instead of stacking a second transformation segment.
      const extras = params.filter((p) => !["f", "q", "c", "w"].includes(keyOf(p)));
      const merged = [...ours, ...extras].join(",");
      return `${prefix}${[merged, ...remaining].join("/")}`;
    }

    // A plain crop/gravity segment with none of our params: prepend ours,
    // keep the existing one untouched right after it.
    return `${prefix}${[ours.join(","), transformSegment, ...remaining].join("/")}`;
  }

  return `${prefix}${[ours.join(","), ...remaining].join("/")}`;
}

/**
 * Backlog 10.42 — the `src` `CatalogImage` hands to `next/image`'s default (Vercel) loader.
 *
 * Backlog 6.4 pointed `next/image` straight at Cloudinary (`cloudinaryLoader` below), so every
 * storefront impression was Cloudinary bandwidth: 35 GB in the first 30 days of v2 against a
 * 25-credit free plan (02-infra-baseline.md, 6.6 re-measure). Vercel's optimizer instead
 * fetches each photo from Cloudinary once per rendered width and serves it from its own cache
 * (`images.minimumCacheTTL` in next.config.ts), so Cloudinary only pays for those origin
 * fetches. This helper caps what that origin fetch is — `f_webp,q_auto,c_limit,w_1600` — so the
 * per-size fetch is small: measured on live photos, a 1.8 MB PNG original became 650 KB with
 * `q_auto` alone (still PNG) and 72 KB as WebP; Vercel's optimizer decodes WebP input fine and
 * still negotiates WebP/AVIF per browser on the way out. Cloudinary creates and caches that
 * derived copy once per photo (one transformation each).
 */
export function cloudinaryOriginSrc(src: string): string {
  return withTransform(src, ["f_webp", "q_auto", "c_limit", `w_${ORIGIN_MAX_WIDTH}`]);
}

/**
 * `next/image` loader that delivers straight from Cloudinary at the rendered width
 * (`f_auto,q_auto,c_limit,w_<width>`), bypassing Vercel's optimizer. Backlog 6.4's default;
 * **no longer used by `CatalogImage` since 10.42** (see `cloudinaryOriginSrc` — direct delivery
 * bills every impression as Cloudinary bandwidth). Kept, with its unit tests, in case a surface
 * ever needs Cloudinary-side delivery deliberately (e.g. a non-Vercel host).
 *
 * - A `quality` prop maps to `q_<quality>` instead of `q_auto`.
 */
export const cloudinaryLoader: ImageLoader = ({ src, width, quality }) => {
  const qualityParam = quality ? `q_${quality}` : "q_auto";
  return withTransform(src, ["f_auto", qualityParam, "c_limit", `w_${width}`]);
};
