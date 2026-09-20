import type { Metadata } from "next";

// `admin/media/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30.
export const metadata: Metadata = { title: "الصور" };

export default function AdminMediaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
