import { formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";

/**
 * 14-day sales sparkline for an outlet's اليوم (backlog 11.2) — one lapis line + area, plain
 * SVG like `TrendChart` (no charting library). Time runs left to right regardless of the page
 * direction (`dir="ltr"` on the svg), with the first and last day labelled.
 */
const INK = "hsl(228 40% 14%)";

export function SalesSparkline({ points }: { points: { date: string; revenuePiastres: number; salesCount: number }[] }) {
  const W = 600;
  const H = 120;
  const PAD = 8;
  const values = points.map((p) => p.revenuePiastres / 100);
  const max = Math.max(1, ...values);
  const n = Math.max(1, points.length - 1);
  const x = (i: number) => PAD + (i / n) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = values.length
    ? `${line} L${x(values.length - 1).toFixed(1)} ${H - PAD} L${x(0).toFixed(1)} ${H - PAD} Z`
    : "";
  const total = points.reduce((s, p) => s + p.revenuePiastres, 0);
  const label = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

  return (
    <figure data-testid="sales-sparkline" className="m-0">
      <figcaption className="mb-1 px-1 text-xs text-ink-soft">
        الإجمالي <span dir="ltr">{formatNumberEn(piastresToEgp(total))}</span> ج.م
      </figcaption>
      <svg style={{ direction: "ltr" }}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`مبيعات آخر ${points.length} يومًا، الإجمالي ${formatNumberEn(piastresToEgp(total))} جنيه`}
        className="h-[120px] w-full"
      >
        <path d={area} fill={INK} opacity={0.06} />
        <path d={line} fill="none" stroke={INK} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {values.length > 0 && <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3.5} fill={INK} />}
      </svg>
      {points.length > 1 && (
        <div dir="ltr" className="mt-1 flex justify-between px-1 text-[11px] text-ink-soft">
          <span>{label(points[0].date)}</span>
          <span>{label(points[points.length - 1].date)}</span>
        </div>
      )}
    </figure>
  );
}
