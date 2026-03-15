import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "شركاؤنا",
  description: "انضم إلى شركاء ملوك النيل — تسجيل وكيل أونلاين أو موزع أونلاين",
  path: "/partners",
});

export default function PartnersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
