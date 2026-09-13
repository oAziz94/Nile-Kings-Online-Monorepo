import { Badge } from "@/components/ui/badge";

/**
 * "مقارنة بالفترة السابقة" cell (backlog 7.4) — shared by every report breakdown table that
 * carries a per-row previous-period comparison. Extracted from the sales report's product
 * table (5.6a), which originated this exact rendering: up/down/flat tone via `Badge`,
 * Western numerals, LTR sign. A `previous` of 0 with a positive `current` renders "+100%"
 * (the product table's existing convention) rather than "—"; "—" is reserved for a genuinely
 * undefined comparison, which this cell never receives (every caller defaults previous to 0).
 */
export function DeltaCell({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const pct = previous !== 0 ? (diff / Math.abs(previous)) * 100 : current > 0 ? 100 : 0;
  const tone = diff > 0 ? "success" : diff < 0 ? "destructive" : "secondary";
  return (
    <Badge variant={tone} className="gap-1">
      <span dir="ltr">{diff === 0 ? "0%" : `${diff > 0 ? "+" : ""}${Math.round(pct)}%`}</span>
    </Badge>
  );
}
