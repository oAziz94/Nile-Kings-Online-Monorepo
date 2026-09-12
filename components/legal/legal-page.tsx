import type { ReactNode } from "react";
import { LegalTocDesktop, LegalTocMobile } from "@/components/legal/legal-toc";

export type LegalSection = {
  title: string;
  body: ReactNode;
};

/**
 * Shared shell for `/terms` and `/privacy` (backlog 4.15). Editorial, not a card: an inline-start
 * `h1`, a hairline under the header, a sticky Archivo-numbered table of contents on `lg`
 * collapsing into the shared `Disclosure` on mobile, and hairline-separated sections — no icon
 * tile, no centred hero, no rounded panels (the storefront's "cards are not cards" rule,
 * `03-backlog.md`'s shared visual-language paragraph for this batch). Purely presentational: no
 * data fetching, no client state of its own (the only interactivity — the TOC's current-section
 * mark — lives in the small client subcomponents in `legal-toc.tsx`).
 */
export function LegalPage({
  title,
  description,
  updatedAt,
  sections,
}: {
  title: string;
  description: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  const titles = sections.map((section) => section.title);

  return (
    <div className="container px-4 py-6 md:py-8" dir="rtl">
      <header className="max-w-2xl border-b border-[hsl(228_16%_84%)] pb-6 md:pb-8">
        <h1 className="font-amiri text-[34px] font-bold leading-tight text-[hsl(228_40%_14%)] md:text-[44px]">
          {title}
        </h1>
        <p className="mt-4 text-[16px] leading-[1.8] text-[hsl(228_26%_24%)]">{description}</p>
        <p className="mt-4 text-sm text-[hsl(228_18%_50%)]">
          آخر تحديث:{" "}
          <span className="font-archivo" style={{ direction: "ltr" }}>
            {updatedAt}
          </span>
        </p>
      </header>

      <div className="pt-6 md:pt-8">
        <LegalTocMobile titles={titles} />

        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10">
          <LegalTocDesktop titles={titles} />

          <article>
            {sections.map((section, index) => (
              <section
                key={section.title}
                id={`section-${index + 1}`}
                className="scroll-mt-[76px] border-b border-[hsl(228_16%_84%)] py-8 first:pt-0 last:border-b-0 lg:scroll-mt-[100px]"
              >
                <h2 className="mb-4 flex items-baseline gap-3 text-[hsl(228_40%_14%)]">
                  <span
                    className="font-archivo text-base text-[hsl(228_18%_50%)]"
                    style={{ direction: "ltr" }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-amiri text-[26px] font-bold">{section.title}</span>
                </h2>
                <div className="legal-content max-w-[68ch] text-[15px] leading-[1.9] text-[hsl(228_26%_24%)] md:text-base">
                  {section.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </div>
    </div>
  );
}
