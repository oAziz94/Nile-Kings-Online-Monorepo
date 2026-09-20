import type { Metadata } from "next";

// `profile/senior/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. The page's on-screen heading is "العرض الخاص" (senior discount offer), not
// the backlog's placeholder "كبار الزوار" — using the real label per task instructions.
export const metadata: Metadata = { title: "العرض الخاص" };

export default function ProfileSeniorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
