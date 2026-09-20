import type { Metadata } from "next";

// `partner/network/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. Label matches `PARTNER_NAV_SECTIONS`'s "الموزعون" entry.
export const metadata: Metadata = { title: "الموزعون" };

export default function PartnerNetworkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
