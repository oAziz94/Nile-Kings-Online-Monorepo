"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Disclosure } from "@/components/shared/disclosure";
import { cn } from "@/lib/utils";

/**
 * Tracks which `#section-N` heading is currently under the fixed navbar, for the table of
 * contents' gold "you are here" mark (`components/shared/site-navbar.tsx`'s `CurrentMark`
 * pattern, adapted to a vertical list). Progressive enhancement only — every link below is a
 * plain working anchor (`href="#section-N"`) whether or not this observer ever fires.
 */
function useActiveSection(sectionIds: string[]): number {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b
        );
        const idx = elements.indexOf(topMost.target as HTMLElement);
        if (idx !== -1) setActiveIndex(idx);
      },
      // Fires once a section clears the fixed navbar and before it leaves the top third of
      // the viewport, so the mark updates while the section is still comfortably on screen.
      { rootMargin: "-110px 0px -65% 0px", threshold: 0 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sectionIds]);

  return activeIndex;
}

function TocLinks({
  titles,
  activeIndex,
  onNavigate,
}: {
  titles: string[];
  activeIndex: number;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="المحتويات" className="space-y-0.5">
      {titles.map((title, index) => {
        const isActive = index === activeIndex;
        return (
          <Link
            key={title}
            href={`#section-${index + 1}`}
            onClick={onNavigate}
            aria-current={isActive ? "location" : undefined}
            className={cn(
              "flex items-baseline gap-2 border-e-2 py-1.5 ps-3 text-sm leading-6 transition-colors",
              isActive
                ? "border-gold-500 font-medium text-[hsl(228_40%_14%)]"
                : "border-transparent text-[hsl(228_18%_50%)] hover:text-[hsl(228_40%_14%)]"
            )}
          >
            <span className="font-archivo text-xs" style={{ direction: "ltr" }}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{title}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop sticky sidebar table of contents (`lg`: `grid-cols-[240px_1fr]`'s first column). */
export function LegalTocDesktop({ titles }: { titles: string[] }) {
  const ids = titles.map((_, index) => `section-${index + 1}`);
  const activeIndex = useActiveSection(ids);

  return (
    <aside className="hidden lg:sticky lg:top-[108px] lg:block lg:self-start">
      <TocLinks titles={titles} activeIndex={activeIndex} />
    </aside>
  );
}

/** Mobile table of contents — the same links collapsed into the shared `Disclosure` primitive. */
export function LegalTocMobile({ titles }: { titles: string[] }) {
  const ids = titles.map((_, index) => `section-${index + 1}`);
  const activeIndex = useActiveSection(ids);
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-2 lg:hidden">
      <Disclosure title="المحتويات" open={open} onOpenChange={setOpen}>
        <TocLinks titles={titles} activeIndex={activeIndex} onNavigate={() => setOpen(false)} />
      </Disclosure>
    </div>
  );
}
