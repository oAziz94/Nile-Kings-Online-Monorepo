import type { Metadata } from "next";

// `partner/notifications/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30's pattern, applied to the new 10.35 page.
export const metadata: Metadata = { title: "الإشعارات" };

export default function PartnerNotificationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
