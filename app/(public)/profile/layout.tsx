import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ProfileNav } from "./profile-nav";

// Backlog 4.13: transactional/account pages stay out of search results (decided —
// inventory `[NEEDS PM INPUT]`).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/profile");

  return (
    <div className="container px-4 py-6 md:py-8">
      <h1 className="font-amiri text-[32px] font-bold text-[hsl(228_40%_14%)] md:text-[38px]">
        حسابي
      </h1>
      <div className="mt-5 border-t border-[hsl(228_16%_84%)] pt-6 lg:mt-6 lg:grid lg:grid-cols-[220px_1fr] lg:gap-12 lg:pt-8">
        <ProfileNav />
        <main className="mt-6 min-w-0 lg:mt-0">{children}</main>
      </div>
    </div>
  );
}
