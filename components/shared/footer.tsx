import Link from "next/link";

const footerLinks = {
  تسوق: [
    { label: "كل المنتجات", href: "/products" },
    { label: "التصنيفات", href: "/categories" },
    { label: "العروض", href: "/offers" },
  ],
  مساعدة: [
    { label: "الأسئلة الشائعة", href: "/faq" },
    { label: "الشحن والإرجاع", href: "/shipping" },
    { label: "اتصل بنا", href: "/contact" },
  ],
  قانونية: [
    { label: "الشروط والأحكام", href: "/terms" },
    { label: "سياسة الخصوصية", href: "/privacy" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-foreground">
      <div className="container px-4 py-8 md:py-10">
        <div className="flex flex-col items-center gap-5 text-center">
          <Link href="/" className="text-lg font-semibold text-background">
            نايل كينجز
          </Link>
          <nav className="flex flex-wrap justify-center gap-6">
            {Object.entries(footerLinks).flatMap(([, links]) =>
              links.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-sm text-background/80 transition-colors hover:text-background"
                >
                  {label}
                </Link>
              ))
            )}
          </nav>
          <p className="text-sm text-background/60">
            © {new Date().getFullYear()} نايل كينجز. جميع الحقوق محفوظة.
          </p>
        </div>
      </div>
    </footer>
  );
}
