import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { ProfileNav } from "./profile-nav";

// Backlog 4.13: transactional/account pages stay out of search results (decided —
// inventory `[NEEDS PM INPUT]`).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Design tokens — lifted verbatim from design-canvas/account/build.mjs's `T` (never
// approximated to the shared `gold-500`/`ink` Tailwind tokens, which are calibrated to a
// slightly different shade — backlog 6.2).
const INK = "#151A35";
const INK_60 = "rgba(21,26,53,.6)";
const RULE = "rgba(21,26,53,.16)";
const GOLD = "hsl(var(--gold-500))"; // the site token, not the canvas literal — one gold across the storefront (04-decisions 2026-09-13)

/** Same "first letter of the name, or a neutral glyph" rule as the navbar's account control. */
function initialFor(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed[0] : "؟";
}

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) redirect("/login?redirect=/profile");

  // Server Component: read the identity-strip data straight from Prisma (backlog 6.2) rather
  // than a client fetch — createdAt/orderCount are also additive on GET /api/profile/account
  // for the account page's own client-side needs (e.g. "آخر تحديث").
  const [dbUser, orderCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sessionUser.userId },
      select: { name: true, phone: true, createdAt: true },
    }),
    prisma.order.count({ where: { userId: sessionUser.userId, status: { not: "CANCELLED" } } }),
  ]);

  const name = dbUser?.name?.trim() || "";
  const phone = dbUser?.phone ?? sessionUser.phone;
  const memberSinceYear = (dbUser?.createdAt ?? new Date()).getFullYear();
  const initial = initialFor(name);

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-14 pt-7 lg:px-10 lg:pb-[72px] lg:pt-11">
      {/* Identity strip */}
      <div className="flex items-center gap-3.5 lg:gap-5">
        <span
          aria-hidden="true"
          className="font-amiri grid shrink-0 place-items-center rounded-full border text-[24px] lg:h-16 lg:w-16 lg:text-[30px]"
          style={{ borderColor: GOLD, color: INK, width: 52, height: 52 }}
        >
          {initial}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="font-amiri truncate text-[28px] font-bold leading-tight lg:text-[38px]" style={{ color: INK }}>
            {name || "حسابي"}
          </h1>
          <div
            className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13.5px]"
            style={{ color: INK_60 }}
          >
            <span dir="ltr" className="font-archivo">
              {phone}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {/* A bare year has no thousands separator — formatNumberEn would render "2,026". */}
              عميل منذ <span className="font-archivo">{memberSinceYear}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="font-archivo">{formatNumberEn(orderCount)}</span> طلبات
            </span>
          </div>
        </div>
      </div>

      {/* Hairline + shell grid (rail on lg+, tabs below lg — both live inside ProfileNav so
          `children` never renders twice). */}
      <div
        className="mt-7 border-t pt-8 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-14 lg:pt-9"
        style={{ borderColor: RULE }}
      >
        <ProfileNav />
        <main className="mt-6 min-w-0 lg:mt-0">{children}</main>
      </div>
    </div>
  );
}
