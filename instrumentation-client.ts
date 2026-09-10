import * as Sentry from "@sentry/nextjs";

// Free Sentry "Developer" tier: 5K errors/month, capped at 1 user — see
// docs/redesign/04-decisions.md 2026-09-09. No session replay (it eats the
// event quota fast); sampling stays conservative.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
