import type { Metadata } from "next";
import { Amiri, Archivo, Cairo, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { baseMetadata } from "@/lib/seo";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

/**
 * Amiri / IBM Plex Sans Arabic / Archivo — loaded once, site-wide, per backlog 4.6 (moved out of
 * app/(auth)/layout.tsx, which previously owned these). Exposed as the same CSS variable names so
 * (auth) keeps resolving unchanged; the (public) route group also opts into `font-plex-arabic` as
 * its body face. Admin/partner stay on Cairo only — these variables exist on <html> but nothing
 * outside (auth)/(public) references the font-amiri/font-plex-arabic/font-archivo utilities.
 */
const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  ...baseMetadata(),
  title: "قطن ملوك النيل",
  description: "متجر قطن ملوك النيل أونلاين - تسوق من أفضل المنتجات مع توصيل لجميع المحافظات",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      dir="rtl"
      lang="ar"
      className={`${cairo.variable} ${amiri.variable} ${plexArabic.variable} ${archivo.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-cairo" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
