import { NextRequest } from "next/server";

/**
 * GET /api/cron/trigger-release-reservations
 * Invoked by Vercel Cron (every 5 min). Calls the job endpoint with CRON_SECRET from env
 * so the cron schedule works without putting the secret in vercel.json (Option B).
 * Requires CRON_SECRET to be set in .env / Vercel env.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response(
      JSON.stringify({ success: false, error: "CRON_SECRET not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const base = req.nextUrl.origin;
  const jobUrl = `${base}/api/jobs/release-expired-reservations?secret=${encodeURIComponent(secret)}`;

  const res = await fetch(jobUrl, { method: "GET" });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
