import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingDots } from "@/components/shared/loading-dots";
import { SearchContent } from "./search-content";

/**
 * `/search` — backlog 6.1. Genuinely new surface (`00-feature-inventory/public/search.md`: the
 * route existed as an empty directory with no page and no search entry point in the header at
 * all). `noindex` — this is a query-driven results view, not a page worth ranking on its own.
 */
export const metadata: Metadata = {
  title: "نتائج البحث",
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingDots />}>
      <SearchContent />
    </Suspense>
  );
}
