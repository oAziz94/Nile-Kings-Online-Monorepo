"use client";

import * as React from "react";

/**
 * Remembers which row a user clicked into on a list page, and scrolls that
 * exact row back into view once the list re-renders (e.g. after pressing
 * back from a detail page) — instead of just landing at the top of the page.
 */
export function useRowScrollRestore(storageKey: string, rows: unknown[]) {
  const rememberRow = React.useCallback(
    (rowId: string) => {
      try {
        sessionStorage.setItem(storageKey, rowId);
      } catch {
        // sessionStorage unavailable (private mode, etc.) — scroll restore just won't happen
      }
    },
    [storageKey]
  );

  React.useEffect(() => {
    let storedId: string | null = null;
    try {
      storedId = sessionStorage.getItem(storageKey);
    } catch {
      return;
    }
    if (!storedId) return;
    if (rows.length === 0) return; // list hasn't finished loading yet — wait for the next update

    const el = document.querySelector(`[data-row-id="${CSS.escape(storedId)}"]`);
    if (el) {
      el.scrollIntoView({ block: "center" });
    }
    // Either scrolled to it, or the row genuinely isn't on this page/filter — either
    // way this one-shot restore intent is spent.
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, storageKey]);

  return { rememberRow };
}
