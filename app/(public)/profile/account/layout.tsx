import type { Metadata } from "next";

// `profile/account/page.tsx` is a client component (react-hook-form state) and cannot export
// metadata itself — backlog 10.30.
export const metadata: Metadata = { title: "بيانات الحساب" };

export default function ProfileAccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
