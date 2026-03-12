/**
 * SEO metadata for Arabic storefront pages.
 */

import type { Metadata } from "next";

const SITE_NAME = "نايل كينجز";
const DEFAULT_DESCRIPTION = "متجر نايل كينجز أونلاين - تسوق من أفضل المنتجات مع توصيل لجميع المحافظات";

const DEFAULT_APP_URL = "https://nilekingscotton.com";

function appUrl(path = ""): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    DEFAULT_APP_URL;
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
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
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
  const image = imageUrl ? (imageUrl.startsWith("http") ? imageUrl : appUrl(imageUrl)) : undefined;
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
