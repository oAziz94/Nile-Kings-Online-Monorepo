/**
 * GA4 client-side helpers (backlog 6.7). No-ops entirely when `window.gtag` is absent — either
 * because `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is unset (localhost, the test branch) or the
 * `<Ga4 />` script hasn't finished loading yet. Never sends PII (phone, name, address text,
 * user id) — only product/order data already public on the storefront.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Fires a GA4 event through `window.gtag`; a silent no-op when gtag isn't present. */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params ?? {});
}

/** Builds the standard GA4 ecommerce item shape from storefront variant/product data. */
export function ga4Item(input: {
  sku: string;
  name: string;
  category?: string | null;
  /** Size/colour label, e.g. "أحمر / L". */
  variant?: string | null;
  priceEgp: number;
  quantity?: number;
}): Record<string, unknown> {
  return {
    item_id: input.sku,
    item_name: input.name,
    ...(input.category ? { item_category: input.category } : {}),
    ...(input.variant ? { item_variant: input.variant } : {}),
    price: input.priceEgp,
    quantity: input.quantity ?? 1,
  };
}
