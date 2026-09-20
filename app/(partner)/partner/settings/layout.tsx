import type { Metadata } from "next";

// `partner/settings/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30.
export const metadata: Metadata = { title: "الإعدادات" };

export default function PartnerSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
