import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { baseMetadata } from "@/lib/seo";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  ...baseMetadata(),
  title: "نايل كينجز",
  description: "متجر نايل كينجز أونلاين - تسوق من أفضل المنتجات مع توصيل لجميع المحافظات",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html dir="rtl" lang="ar" className={cairo.variable} suppressHydrationWarning>
      <body className="min-h-screen font-cairo" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
