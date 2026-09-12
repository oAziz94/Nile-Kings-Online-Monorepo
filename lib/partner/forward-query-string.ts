/**
 * Backlog 5.1 — old partner routes redirect to their v2 homes, but several carry real,
 * still-honoured query filters (`?status=`, `?variantId=`, `?lowStock=1`, …). This turns a
 * Next.js `searchParams` object back into a `"?a=b&c=d"` string (or `""`) so a redirect
 * page can forward it instead of dropping every deep link's filter on the floor.
 */
export function forwardQueryString(searchParams: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value !== undefined) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
