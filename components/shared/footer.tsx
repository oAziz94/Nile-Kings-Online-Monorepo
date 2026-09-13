import Image from "next/image";
import Link from "next/link";
import { Ankh } from "@/components/brand/ankh";
import { MENU_SECTIONS } from "@/lib/menu-config";

/**
 * Storefront footer — backlog 4.6, artboard 1a/1b of `Storefront v3.dc.html`, later switched from
 * the canvas's ivory ground to navy ink (user note, 2026-09-12: "I think it will be better if we
 * make the footer navy instead of white") — the one dark band on an otherwise all-papyrus
 * storefront, cream logo, papyrus text, faint papyrus Ankh watermark.
 *
 * Every link here resolves to a real route or a real contact channel already wired elsewhere in
 * the app (`components/shared/menu-drawer.tsx`) — no invented handles, no dead `#` hrefs, no
 * newsletter form (standing rule 3, `04-decisions.md` 2026-09-12): a social link is only rendered
 * when its underlying env var is actually configured.
 */

type FooterLink = { label: string; href: string; external?: boolean };

const CATEGORY_LINKS: FooterLink[] = MENU_SECTIONS.map((section) => ({
  label: section.labelAr.replace(/^كولكشن\s*/, ""),
  href: section.children[0]?.href ?? `/categories/${section.slug}`,
}));

const HELP_LINKS: FooterLink[] = [{ label: "كل المنتجات", href: "/products" }];

const LEGAL_LINKS: FooterLink[] = [
  { label: "الشروط والأحكام", href: "/terms" },
  { label: "سياسة الخصوصية", href: "/privacy" },
];

function socialLinks() {
  const links: { label: string; href: string; icon: React.ReactNode }[] = [];
  const fb = process.env.NEXT_PUBLIC_FACEBOOK_URL;
  if (fb) {
    links.push({
      label: "تابعنا على فيسبوك",
      href: fb,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M14 8h2V5h-2a3 3 0 0 0-3 3v2H9v3h2v7h3v-7h2l1-3h-3V8z" />
        </svg>
      ),
    });
  }
  const wa = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (wa) {
    links.push({
      label: "تواصل معنا على واتساب",
      href: `https://wa.me/${wa.replace(/\D/g, "")}`,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M4 20l1.4-4.6A8 8 0 1 1 8.6 18.6L4 20z" />
        </svg>
      ),
    });
  }
  const tel = process.env.NEXT_PUBLIC_CUSTOMER_SERVICE_PHONE;
  if (tel) {
    links.push({
      label: "خدمة عملاء",
      href: `tel:${tel.replace(/\D/g, "")}`,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M6 4h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2C10.6 20 4 13.4 4 6a2 2 0 0 1 2-2z" />
        </svg>
      ),
    });
  }
  return links;
}

export function Footer() {
  const contactHref = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
    ? `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER.replace(/\D/g, "")}`
    : null;
  const social = socialLinks();

  // Below lg the fixed GovernorateSelector pill sits at bottom-start; the extra bottom padding
  // keeps it off the footer's last line — and, since the footer is always the last element, off
  // every page's content (backlog 7.2).
  return (
    <footer className="relative overflow-hidden bg-[hsl(228_40%_14%)] pb-[calc(4rem+env(safe-area-inset-bottom))] text-papyrus/85 lg:pb-0">
      <Ankh
        size={280}
        strokeWidth={0.9}
        className="pointer-events-none absolute -bottom-24 -end-6 text-papyrus opacity-[0.05]"
      />
      <div className="relative mx-auto max-w-[1400px] px-6 py-12 md:px-12 md:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-12">
          <div className="flex flex-col items-center gap-5 text-center md:items-start md:text-right">
            <Link href="/" aria-label="العودة للمتجر — قطن ملوك النيل">
              <Image
                src="/brand/logo-cream.png"
                alt="قطن ملوك النيل"
                width={700}
                height={437}
                className="h-16 w-auto md:h-20"
              />
            </Link>
            <p className="max-w-[320px] text-sm leading-relaxed text-papyrus/65">
              ملابس من القطن المصري طويل التيلة، تُصنع بالكامل في مصر.
            </p>
            {social.length > 0 && (
              <div className="flex gap-1">
                {social.map((s) => (
                  <a
                    key={s.href}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="flex h-11 w-11 items-center justify-center text-papyrus/85 transition-colors hover:text-gold-500"
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            )}
          </div>

          <FooterColumn title="الفئات" links={CATEGORY_LINKS} />
          <FooterColumn
            title="المساعدة"
            links={
              contactHref
                ? [...HELP_LINKS, { label: "تواصل معنا", href: contactHref, external: true }]
                : HELP_LINKS
            }
          />
          <FooterColumn title="قانوني" links={LEGAL_LINKS} />
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-papyrus/15 pt-6 text-xs text-papyrus/55 md:flex-row">
          <span>
            © <span className="font-archivo" style={{ direction: "ltr" }}>{new Date().getFullYear()}</span> قطن ملوك النيل. جميع الحقوق محفوظة.
          </span>
          <span>صُنع في مصر</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="text-center md:text-right">
      <h3 className="mb-4 text-[13px] font-medium tracking-wide text-papyrus/55">{title}</h3>
      <ul className="flex flex-col items-center gap-3 md:items-start">
        {links.map((l) =>
          l.external ? (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-papyrus/85 transition-colors hover:text-gold-500"
              >
                {l.label}
              </a>
            </li>
          ) : (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-sm text-papyrus/85 transition-colors hover:text-gold-500"
              >
                {l.label}
              </Link>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
