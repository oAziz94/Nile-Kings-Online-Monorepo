"use client";

import * as React from "react";
import { formatNumberEn } from "@/lib/format-en-numbers";

/**
 * اليوم's 30-day trend (backlog 5.2) — single lapis line + area for the current period, a
 * muted stone line for the previous equal period, one shared y-axis, a direct value label on
 * the current series' last point, and a hover tooltip (no charting library, plain SVG — same
 * approach `getRevenueOverTime`'s data already uses elsewhere in this codebase).
 */
export type TrendChartPoint = { date: string; revenuePiastres: number; orderCount: number };

const WIDTH = 760;
const HEIGHT = 220;
const PAD_LEFT = 44;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export function TrendChart({
  metric,
  current,
  previous,
}: {
  metric: "revenue" | "orders";
  current: TrendChartPoint[];
  previous: TrendChartPoint[];
}) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const valueOf = React.useCallback(
    (p: TrendChartPoint) => (metric === "revenue" ? p.revenuePiastres / 100 : p.orderCount),
    [metric]
  );

  const currentValues = current.map(valueOf);
  const previousValues = previous.map(valueOf);
  const max = niceMax(Math.max(1, ...currentValues, ...previousValues));
  const n = Math.max(1, current.length - 1);

  const x = (i: number) => PAD_LEFT + (i / n) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  const y = (v: number) => HEIGHT - PAD_BOTTOM - (v / max) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const linePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const areaPath =
    currentValues.length > 0
      ? `${linePath(currentValues)} L${x(currentValues.length - 1).toFixed(1)} ${(HEIGHT - PAD_BOTTOM).toFixed(1)} L${x(0).toFixed(1)} ${(HEIGHT - PAD_BOTTOM).toFixed(1)} Z`
      : "";

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: y(max * t),
    label: metric === "revenue" ? `${formatNumberEn(Math.round((max * t) / 10) * 10)}` : formatNumberEn(Math.round(max * t)),
  }));

  const xLabelIndices = [0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n];

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || current.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (relX - PAD_LEFT) / (WIDTH - PAD_LEFT - PAD_RIGHT);
    const idx = Math.round(ratio * n);
    setHoverIndex(Math.min(n, Math.max(0, idx)));
  }

  const lastValue = currentValues[currentValues.length - 1] ?? 0;
  const lastPoint = current[current.length - 1];

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ direction: "ltr" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        tabIndex={0}
        onFocus={() => setHoverIndex((i) => i ?? current.length - 1)}
        onBlur={() => setHoverIndex(null)}
        onKeyDown={(e) => {
          if (current.length === 0) return;
          const last = current.length - 1;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            // The SVG is ltr: right moves to a later day, left to an earlier one.
            const step = e.key === "ArrowRight" ? 1 : -1;
            setHoverIndex((i) => Math.min(last, Math.max(0, (i ?? last) + step)));
          } else if (e.key === "Home") {
            e.preventDefault();
            setHoverIndex(0);
          } else if (e.key === "End") {
            e.preventDefault();
            setHoverIndex(last);
          } else if (e.key === "Escape") {
            setHoverIndex(null);
          }
        }}
        role="img"
        aria-label={`${metric === "revenue" ? "الإيراد آخر 30 يومًا" : "الطلبات آخر 30 يومًا"} — استخدم الأسهم لتصفح الأيام`}
        className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
      >
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={g.y} y2={g.y} stroke="hsl(38 22% 93%)" />
            <text x={PAD_LEFT - 8} y={g.y + 4} fontSize="10" fill="hsl(225 10% 42%)" textAnchor="end">
              {g.label}
            </text>
          </g>
        ))}
        {xLabelIndices.map((idx) => {
          const point = current[idx];
          if (!point) return null;
          return (
            <text key={idx} x={x(idx)} y={HEIGHT - 8} fontSize="10" fill="hsl(225 10% 42%)" textAnchor="middle">
              {new Date(point.date).toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short" })}
            </text>
          );
        })}

        {previousValues.length > 1 && (
          <path d={linePath(previousValues)} fill="none" stroke="hsl(34 12% 76%)" strokeWidth="2" strokeDasharray="4 3" />
        )}

        {areaPath && <path d={areaPath} fill="hsl(228 40% 14%)" opacity="0.06" />}
        {currentValues.length > 1 && <path d={linePath(currentValues)} fill="none" stroke="hsl(228 40% 14%)" strokeWidth="2" strokeLinejoin="round" />}

        {currentValues.length > 0 && (
          <>
            <circle cx={x(currentValues.length - 1)} cy={y(lastValue)} r="4" fill="hsl(228 40% 14%)" stroke="#fff" strokeWidth="2" />
            <text
              x={x(currentValues.length - 1) - 6}
              y={y(lastValue) - 10}
              fontSize="11"
              fontWeight="800"
              fill="hsl(228 40% 14%)"
              textAnchor="end"
            >
              {formatNumberEn(Math.round(lastValue))}
            </text>
          </>
        )}

        {hoverIndex !== null && current[hoverIndex] && (
          <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="hsl(36 16% 87%)" />
        )}
        {hoverIndex !== null && current[hoverIndex] && (
          <circle cx={x(hoverIndex)} cy={y(currentValues[hoverIndex])} r="4" fill="hsl(228 40% 14%)" stroke="#fff" strokeWidth="2" />
        )}
      </svg>

      {hoverIndex !== null && current[hoverIndex] && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-lapis-900 px-2.5 py-1.5 text-xs font-bold text-white shadow-lg"
          style={{
            left: `${(x(hoverIndex) / WIDTH) * 100}%`,
            top: `${(y(currentValues[hoverIndex]) / HEIGHT) * 100}%`,
          }}
        >
          <div className="text-[11px] font-semibold text-white/70">
            {new Date(current[hoverIndex].date).toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "long" })}
          </div>
          <div>
            {metric === "revenue" ? (
              <>
                <span dir="ltr">{formatNumberEn(Math.round(current[hoverIndex].revenuePiastres / 100))}</span> ج.م
              </>
            ) : (
              <>
                <span dir="ltr">{formatNumberEn(current[hoverIndex].orderCount)}</span> طلب
              </>
            )}
          </div>
        </div>
      )}
      {lastPoint === undefined && (
        <p className="py-10 text-center text-sm text-ink-soft">لا توجد بيانات كافية بعد</p>
      )}
    </div>
  );
}
