import { redirect } from "next/navigation";

/**
 * `/admin/analytics` (backlog 9.6 (d), B4) — permanent redirect to its replacement,
 * `/admin/reports/sales`. `?from&to` (the old date-range querystring) maps to the new report
 * platform's `preset=custom&from&to` so an old bookmark/link with an explicit range still
 * lands on the same period instead of silently falling back to the new page's default preset.
 */
export default async function AdminAnalyticsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  if (from && to) {
    redirect(`/admin/reports/sales?preset=custom&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }
  redirect("/admin/reports/sales");
}
