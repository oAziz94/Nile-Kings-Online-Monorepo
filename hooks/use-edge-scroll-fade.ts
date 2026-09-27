"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks whether a horizontally-scrollable element still has content hidden past its
 * inline-end edge (the direction more content is revealed by scrolling further), so a
 * caller can show/hide an edge-fade cue — backlog 10.33.
 *
 * RTL note: the CSSOM View spec (implemented by current Chrome, Firefox and Safari) reports
 * `scrollLeft` as `0` at the reading-start edge and running negative toward the
 * reading-end edge when the element's `direction` is `rtl` (LTR keeps the familiar
 * `0..scrollWidth-clientWidth` positive range with `0` also at the start). Reading
 * `Math.abs(scrollLeft)` therefore gives "distance scrolled from the start edge" in both
 * directions without needing to special-case a sign.
 */
export function useEdgeScrollFade<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [hasMoreEnd, setHasMoreEnd] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 1) {
      setHasMoreEnd(false);
      return;
    }
    const distanceFromStart = Math.abs(el.scrollLeft);
    setHasMoreEnd(distanceFromStart < overflow - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update]);

  return { ref, hasMoreEnd };
}
