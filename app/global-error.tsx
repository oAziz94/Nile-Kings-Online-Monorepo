"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";

// Next.js App Router's top-level catch-all — replaces the entire root layout
// when a rendering error escapes every nested error.tsx boundary, so it needs
// its own <html>/<body>. Reports to Sentry per Sentry's own setup guidance.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1.5rem", textAlign: "center" }}>
        <p style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          حدث خطأ غير متوقع
        </p>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          يرجى المحاولة مرة أخرى، أو العودة لاحقاً إذا استمرت المشكلة.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: "0.625rem 1.5rem",
            borderRadius: "999px",
            border: "none",
            background: "#1c1c1c",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          إعادة المحاولة
        </button>
      </body>
    </html>
  );
}
