/**
 * GA4 client-side helpers (backlog 6.7). No-ops entirely when `NEXT_PUBLIC_GA4_MEASUREMENT_ID`
 * is unset (localhost, the test branch) — inlined at build time, so this check is reliable even
 * before `<Ga4 />`'s scripts have loaded. Never sends PII (phone, name, address text, user id) —
 * only product/order data already public on the storefront.
 *
 * Rework (verifier finding, 2026-09-19): this used to gate on `typeof window.gtag ===
 * "function"`, which silently dropped every event fired before `<Ga4 />`'s `afterInteractive`
 * scripts finish loading — including `view_item` on a direct/cold PDP load (a shopper arriving
 * from Google, an ad, a shared link, or a refresh), since the PDP's mount effect runs well
 * before that. `window.dataLayer` is a plain queue by design (that's the whole point of the
 * gtag.js pattern): push whatever is already queued the moment it finishes loading. This works
 * whether gtag.js has loaded yet or not — queue, don't gate.
 *
 * Rework (backlog 10.32, 2026-09-21): this used to push a plain array `["event", name, params]`.
 * gtag.js's `dataLayer.push` override (installed once gtag.js loads) only recognises the
 * `arguments` object shape its own `gtag()` shim pushes (`function gtag(){dataLayer.push(arguments)}`)
 * — a plain array is silently ignored (no `/g/collect` request), so every custom event since 6.7
 * shipped (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `page_view`,
 * `select_governorate`) never reached GA4, even though it queued fine and the replay in
 * `components/storefront/ga4.tsx` re-pushed it in the right order. Push an `arguments` object
 * instead, built the same way the `gtag()` shim itself does.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Queues a GA4 event onto `window.dataLayer`; a silent no-op when GA4 isn't configured. */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID) return;
  window.dataLayer = window.dataLayer ?? [];
  // Must push the real `arguments` object (gtag.js only drains `arguments`-shaped entries from
  // `dataLayer`, not plain arrays or rest arrays; see file header).
  const pushArguments: (...args: unknown[]) => void = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  pushArguments("event", name, params ?? {});
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
