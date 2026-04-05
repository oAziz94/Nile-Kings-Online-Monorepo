/**
 * SEO metadata for Arabic storefront pages.
 */

import type { Metadata } from "next";

const SITE_NAME = "نايل كينجز";
const DEFAULT_DESCRIPTION = "متجر نايل كينجز أونلاين - تسوق من أفضل المنتجات مع توصيل لجميع المحافظات";

const DEFAULT_APP_URL = "https://nilekingscotton.com";

/** Open Graph / Twitter default when a page has no specific image (e.g. homepage). File: `public/opengraph.png`. */
const DEFAULT_OG_IMAGE_PATH = "/opengraph.png";

/**
 * Canonical site origin for metadata, canonical URLs, and resolving relative OG image paths.
 * Avoids VERCEL_URL on production (deployment *.vercel.app URLs break Facebook's og:image fetch / Content-Type).
 */
function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_ENV === "production") return DEFAULT_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return DEFAULT_APP_URL;
}

function appUrl(path = ""): string {
  const base = siteOrigin();
  return path ? `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}` : base;
}

export function baseMetadata(): Metadata {
  return {
    metadataBase: new URL(appUrl()),
    title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
    description: DEFAULT_DESCRIPTION,
    openGraph: {
      type: "website",
      locale: "ar_EG",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      images: [{ url: DEFAULT_OG_IMAGE_PATH, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      images: [DEFAULT_OG_IMAGE_PATH],
    },
    alternates: { canonical: appUrl() },
  };
}

export function pageMetadata({
  title,
  description,
  path,
  imageUrl,
}: {
  title: string;
  description?: string;
  path?: string;
  imageUrl?: string | null;
}): Metadata {
  const desc = description ?? DEFAULT_DESCRIPTION;
  const url = path ? appUrl(path) : appUrl();
  const image =
    imageUrl === null
      ? undefined
      : (() => {
          const raw = imageUrl?.trim();
          if (raw) return raw.startsWith("http") ? raw : appUrl(raw);
          // Relative path: Next resolves against metadataBase (same origin as siteOrigin)
          return DEFAULT_OG_IMAGE_PATH;
        })();
  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      url,
      locale: "ar_EG",
      siteName: SITE_NAME,
      ...(image && { images: [{ url: image, alt: title }] }),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description: desc,
      ...(image && { images: [image] }),
    },
    alternates: { canonical: url },
  };
}
