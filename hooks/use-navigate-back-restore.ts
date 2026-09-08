"use client";

import * as React from "react";

type RestoreState = { id: string; count: number };

/**
 * For infinite-scroll listing pages: remembers which product card a shopper
 * clicked and how many items were loaded at that point, so that pressing
 * browser back re-loads the same number of items (not just the first page)
 * and scrolls that exact card back into view instead of dropping the shopper
 * at the top of the list.
 */
export function useNavigateBackRestore(storageKey: string) {
  const [restore] = React.useState<RestoreState | null>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === "string" && typeof parsed.count === "number" && parsed.count > 0) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  const remember = React.useCallback(
    (id: string, count: number) => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ id, count }));
      } catch {
        // sessionStorage unavailable — scroll restore just won't happen
      }
    },
    [storageKey]
  );

  const clear = React.useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { restore, remember, clear };
}
