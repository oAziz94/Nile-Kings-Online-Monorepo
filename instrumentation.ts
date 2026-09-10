import * as Sentry from "@sentry/nextjs";

// Free Sentry "Developer" tier: 5K errors/month, capped at 1 user — see
// docs/redesign/04-decisions.md 2026-09-09. Sampling stays conservative
// (10% traces, no session replay) to fit comfortably inside that.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
