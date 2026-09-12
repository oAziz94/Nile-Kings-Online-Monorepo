import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Fallback UI only — `app/(public)/checkout/page.tsx` already redirects a signed-out visitor to
 * `/login?redirect=/checkout` server-side before this ever mounts (backlog 4.12's approved
 * hardening). Kept as a second layer for the narrow race where the session cookie is valid at
 * render time but the client's own `GET /api/auth/me` call comes back `401` (e.g. expired between
 * the server render and hydration) — same copy/links as before the rebuild.
 */
export function GuestPanel() {
  return (
    <div className="mt-8 border-s-2 border-gold-500 bg-[hsl(38_22%_96%)] p-6 sm:p-8">
      <p className="text-[hsl(228_18%_35%)]">سجّل الدخول أو أنشئ حساباً لإتمام الطلب.</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button asChild className="h-12 rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]">
          <Link href="/login?redirect=/checkout">تسجيل الدخول</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-12 rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)]/5"
        >
          <Link href="/register?redirect=/checkout">إنشاء حساب</Link>
        </Button>
      </div>
      <Link href="/cart" className="mt-4 inline-block border-b border-gold-500 pb-0.5 text-sm text-[hsl(228_40%_14%)] hover:text-gold-600">
        العودة للسلة
      </Link>
    </div>
  );
}
