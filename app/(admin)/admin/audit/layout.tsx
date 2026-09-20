import type { Metadata } from "next";

// `admin/audit/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30.
export const metadata: Metadata = { title: "السجل" };

export default function AdminAuditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
