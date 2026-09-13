import { Badge } from "@/components/ui/badge";
import { computeDelta } from "@/lib/analytics/partner-reports";

/**
 * "مقارنة بالفترة السابقة" cell (backlog 7.4) — shared by every report breakdown table that
 * carries a per-row previous-period comparison. Extracted from the sales report's product
 * table (5.6a) and aligned with the headline tiles' delta text (PM ruling at 7.4 verification):
 * the maths is `computeDelta`, so a previous of 0 with a positive current is an *undefined*
 * percentage and reads "جديد" (never "+100%"), no change reads "—", everything else is a
 * signed rounded percentage with Western numerals and an LTR sign.
 */
export function DeltaCell({ current, previous }: { current: number; previous: number }) {
  const delta = computeDelta(current, previous);
  const tone = delta.direction === "up" ? "success" : delta.direction === "down" ? "destructive" : "secondary";
  const text =
    delta.direction === "flat"
      ? "—"
      : delta.changePct === null
        ? "جديد"
        : `${delta.direction === "up" ? "+" : ""}${Math.round(delta.changePct)}%`;
  return (
    <Badge variant={tone} className="gap-1">
      <span dir="ltr">{text}</span>
    </Badge>
  );
}
