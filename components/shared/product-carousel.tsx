"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const AUTOPLAY_INTERVAL_MS = 5000;
/** Scroll step: one card width + gap (approx). Cards are ~280px, gap 24px. */
const SCROLL_STEP_PX = 304;

interface ProductCarouselProps {
  children: React.ReactNode;
  className?: string;
  /** Enable slow autoplay. Pauses on hover (desktop) and when user scrolls. */
  autoplay?: boolean;
}

function useIsRtl() {
  const [isRtl, setIsRtl] = useState(false);
  useEffect(() => {
    setIsRtl(document.documentElement.dir === "rtl");
    const observer = new MutationObserver(() => setIsRtl(document.documentElement.dir === "rtl"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
    return () => observer.disconnect();
  }, []);
  return isRtl;
}

export function ProductCarousel({ children, className, autoplay = false }: ProductCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const userHasScrolled = useRef(false);
  const isProgrammaticScroll = useRef(false);
  const isRtl = useIsRtl();

  const scrollByStep = useCallback(
    (direction: "prev" | "next") => {
      const el = scrollRef.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;
      const delta = direction === "next" ? (isRtl ? -SCROLL_STEP_PX : SCROLL_STEP_PX) : isRtl ? SCROLL_STEP_PX : -SCROLL_STEP_PX;
      const next = el.scrollLeft + delta;
      if (isRtl) {
        if (next <= -maxScroll) el.scrollTo({ left: -maxScroll, behavior: "smooth" });
        else if (next >= 0) el.scrollTo({ left: 0, behavior: "smooth" });
        else el.scrollBy({ left: delta, behavior: "smooth" });
      } else {
        if (next >= maxScroll) el.scrollTo({ left: maxScroll, behavior: "smooth" });
        else if (next <= 0) el.scrollTo({ left: 0, behavior: "smooth" });
        else el.scrollBy({ left: delta, behavior: "smooth" });
      }
    },
    [isRtl]
  );

  useEffect(() => {
    if (!autoplay || isPaused) return;

    const step = () => {
      const el = scrollRef.current;
      if (!el || userHasScrolled.current) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;
      isProgrammaticScroll.current = true;
      const rtl = getComputedStyle(el).direction === "rtl";
      const current = el.scrollLeft;
      const delta = el.clientWidth * 0.5;
      if (rtl) {
        const next = current - delta;
        if (next <= -maxScroll) el.scrollTo({ left: 0, behavior: "smooth" });
        else el.scrollBy({ left: -delta, behavior: "smooth" });
      } else {
        const next = current + delta;
        if (next >= maxScroll) el.scrollTo({ left: 0, behavior: "smooth" });
        else el.scrollBy({ left: delta, behavior: "smooth" });
      }
    };

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let rafId = 0;
    const timeoutId = window.setTimeout(() => {
      rafId = requestAnimationFrame(() => {
        step();
        intervalId = window.setInterval(step, AUTOPLAY_INTERVAL_MS);
      });
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [autoplay, isPaused]);

  const handleScroll = () => {
    if (isProgrammaticScroll.current) {
      isProgrammaticScroll.current = false;
      return;
    }
    userHasScrolled.current = true;
  };

  return (
    <div className={cn("relative group/carousel", className)}>
      {/* Prev/Next: desktop only, subtle; RTL-aware icons */}
      <button
        type="button"
        onClick={() => scrollByStep("prev")}
        aria-label="السابق"
        className={cn(
          "absolute top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-background/90 p-2 shadow-md backdrop-blur-sm",
          "transition-opacity hover:bg-background hover:shadow-lg",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "md:flex md:opacity-0 md:group-hover/carousel:opacity-100"
        )}
        style={isRtl ? { right: "0.25rem", left: "auto" } : { left: "0.25rem", right: "auto" }}
      >
        {isRtl ? <ChevronRight className="h-5 w-5 text-foreground" /> : <ChevronLeft className="h-5 w-5 text-foreground" />}
      </button>
      <button
        type="button"
        onClick={() => scrollByStep("next")}
        aria-label="التالي"
        className={cn(
          "absolute top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-background/90 p-2 shadow-md backdrop-blur-sm",
          "transition-opacity hover:bg-background hover:shadow-lg",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "md:flex md:opacity-0 md:group-hover/carousel:opacity-100"
        )}
        style={isRtl ? { left: "0.25rem", right: "auto" } : { right: "0.25rem", left: "auto" }}
      >
        {isRtl ? <ChevronLeft className="h-5 w-5 text-foreground" /> : <ChevronRight className="h-5 w-5 text-foreground" />}
      </button>

      <div
        ref={scrollRef}
        dir={isRtl ? "rtl" : "ltr"}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleScroll}
        onScroll={handleScroll}
        className={cn(
          "flex gap-5 overflow-x-auto overflow-y-hidden pb-2 md:gap-6",
          "scroll-smooth snap-x snap-mandatory min-h-0 w-full",
          "[scrollbar-width:none] [-ms-overflow-style:none]",
          "[&::-webkit-scrollbar]:hidden"
        )}
        style={{ WebkitOverflowScrolling: "touch", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {React.Children.map(children, (child) => (
          <div className="shrink-0 snap-center first:ps-0 last:pe-0">{child}</div>
        ))}
      </div>
    </div>
  );
}
