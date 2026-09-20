import type { Metadata } from "next";

// `admin/clients/new/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30.
export const metadata: Metadata = { title: "العملاء · جديد" };

export default function AdminClientNewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
