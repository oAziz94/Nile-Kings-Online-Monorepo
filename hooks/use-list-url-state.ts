"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Backlog 9.0b (iii): every list that searches on keystroke fires a fresh fetch on every
 * `debouncedQ`/filter/page change, but network order isn't request order — a slow earlier
 * response (e.g. the initial empty-query load) can resolve *after* a faster later one (e.g.
 * the user's first keystroke) and overwrite it with stale data. `getAbortSignal()` aborts
 * whatever request this consumer last started (if any) and returns a fresh signal to pass to
 * `fetch`; an aborted fetch rejects with `AbortError` before its `.then`/`await` chain runs,
 * so the stale response's state update never happens. One controller per hook instance (a
 * consumer with several independent lists — see `partner-stock-tab.tsx`'s two fetches, or
 * `admin/media/page.tsx`'s own request-sequence guard for the same hazard without this hook —
 * should call `useRequestAbort()` once per list, not share one across unrelated lists).
 */
export function useRequestAbort(): () => AbortSignal {
  const controllerRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);
  return React.useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller.signal;
  }, []);
}

/**
 * Keeps a list page's search/filters/pagination in the URL so that navigating
 * to a detail page and pressing back restores the exact same list state
 * (search text, active filters, page, page size) instead of resetting it.
 */
export function useListUrlState<F extends Record<string, string>>(
  defaultFilters: F,
  defaultPageSize = 20
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = React.useState(search);
  const [page, setPage] = React.useState(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 0;
  });
  const [pageSize, setPageSize] = React.useState(() => {
    const raw = Number(searchParams.get("pageSize"));
    return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : defaultPageSize;
  });
  const [filters, setFilters] = React.useState<F>(() => {
    const initial = { ...defaultFilters };
    for (const key of Object.keys(defaultFilters) as (keyof F)[]) {
      const value = searchParams.get(key as string);
      if (value != null) initial[key] = value as F[keyof F];
    }
    return initial;
  });

  const filtersKey = JSON.stringify(filters);
  // Snapshot of the values hydrated from the URL on mount — the reset effect below
  // only resets to page 0 once the user actually changes something, comparing against
  // this instead of "first run only" (React Strict Mode double-invokes effects on
  // mount in dev, which broke a "run once" ref guard here).
  const hydratedRef = React.useRef({ debouncedQ, filtersKey });

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    if (
      debouncedQ === hydratedRef.current.debouncedQ &&
      filtersKey === hydratedRef.current.filtersKey
    ) {
      return;
    }
    setPage(0);
  }, [debouncedQ, filtersKey]);

  React.useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    if (page > 0) params.set("page", String(page));
    if (pageSize !== defaultPageSize) params.set("pageSize", String(pageSize));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filtersKey, page, pageSize, pathname]);

  const setFilter = React.useCallback((key: keyof F, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  return {
    search,
    setSearch,
    debouncedQ,
    page,
    setPage,
    pageSize,
    setPageSize,
    filters,
    setFilter,
  };
}
