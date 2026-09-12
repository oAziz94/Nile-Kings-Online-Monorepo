import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { pageMetadata } from "@/lib/seo";
import { CheckoutContent } from "./checkout-content";

/**
 * `robots: { index: false }` — transactional page, never indexed (backlog 4.12, inventory
 * "URL/SEO stability"). Route/path unchanged.
 */
export const metadata: Metadata = {
  ...pageMetadata({
    title: "إتمام الطلب",
    description: "أكمل بيانات التوصيل واختر طريقة الدفع لإتمام طلبك.",
    path: "/checkout",
  }),
  robots: { index: false, follow: false },
};

/**
 * Approved hardening (backlog 4.12 / `02-proposals.md` 2026-09-10): a server-side login guard —
 * `middleware.ts` never matched `/checkout`, so a signed-out visitor previously saw the checkout
 * shell for a moment before the client's own `GET /api/auth/me` swapped in the guest prompt. This
 * redirect is the first layer; `checkout-content.tsx`'s own 401 handling (mid-session expiry,
 * plus a defensive guest panel for the narrow race where the cookie expires between this render
 * and hydration) stays as the second layer, unchanged.
 */
export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?redirect=/checkout");
  }
  return <CheckoutContent />;
}
