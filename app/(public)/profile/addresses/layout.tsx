import type { Metadata } from "next";

// `profile/addresses/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30.
export const metadata: Metadata = { title: "عناويني" };

export default function ProfileAddressesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
