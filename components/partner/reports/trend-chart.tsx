"use client";

import * as React from "react";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import type { ReportSeries } from "@/lib/analytics/partner-reports";

/**
 * Trend chart (backlog 5.6a) — hand-rolled inline SVG, matching the design canvas's own
 * approach (no charting library decision has been recorded in `04-decisions.md`, so this
 * avoids introducing one for a single line chart). One series: single-hue lapis line,
 * previous period as a muted line, one y axis, no legend, a direct label on the last point,
 * and a hover tooltip with a vertical crosshair. Text stays in ink tokens, never the series
 * colour, per the standing chart rules.
 */
const WIDTH = 760;
const HEIGHT = 240;
const PAD_LEFT = 44;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export function TrendChart({ series, unit = "piastres" }: { series: ReportSeries; unit?: "piastres" | "count" }) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const points = series.points;
  const previousPoints = series.previousPoints;
  const n = points.length;
  const maxY = Math.max(1, ...points.map((p) => p.y), ...previousPoints.map((p) => p.y));

  const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) => PAD_LEFT + (n <= 1 ? 0 : (i / (n - 1)) * innerWidth);
  const yFor = (v: number) => PAD_TOP + innerHeight - (v / maxY) * innerHeight;

  const linePath = (pts: { y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.y).toFixed(1)}`).join(" ");

  const formatValue = (v: number) => (unit === "piastres" ? `${formatNumberEn(piastresToEgp(v))} ج.م` : formatNumberEn(v));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = n <= 1 ? 0 : (relX - PAD_LEFT) / innerWidth;
    const idx = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
    setHoverIndex(idx);
  };

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((r) => maxY * r);
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredPrev = hoverIndex !== null ? previousPoints[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ direction: "ltr" }}
        className="block w-full"
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIndex(null)}
        role="img"
        aria-label={series.label}
      >
        {gridLines.map((v, i) => (
          <line key={i} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(v)} y2={yFor(v)} stroke="hsl(38 22% 93%)" />
        ))}
        {points.length > 0 && (
          <>
            <text x={xFor(0)} y={HEIGHT - 8} fontSize="10" fill="hsl(225 10% 42%)" textAnchor="start">
              {formatDateEn(points[0].x)}
            </text>
            <text x={xFor(n - 1)} y={HEIGHT - 8} fontSize="10" fill="hsl(225 10% 42%)" textAnchor="end">
              {formatDateEn(points[n - 1].x)}
            </text>
          </>
        )}

        {/* Previous period — muted line, no markers, no legend (single-series chart). */}
        <path d={linePath(previousPoints)} fill="none" stroke="hsl(225 10% 78%)" strokeWidth={1.5} strokeDasharray="4 3" />

        {/* Current period — the one lapis series. */}
        <path d={linePath(points)} fill="none" stroke="hsl(228 40% 14%)" strokeWidth={2} strokeLinejoin="round" />

        {points.length > 0 && (
          <>
            <circle cx={xFor(n - 1)} cy={yFor(points[n - 1].y)} r={4} fill="hsl(228 40% 14%)" stroke="#fff" strokeWidth={2} />
            {/* Direct label on the last point. */}
            <text x={xFor(n - 1) - 6} y={yFor(points[n - 1].y) - 10} fontSize="11" fontWeight={800} fill="hsl(228 22% 14%)" textAnchor="end">
              {formatValue(points[n - 1].y)}
            </text>
          </>
        )}

        {hoverIndex !== null && (
          <line x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="hsl(225 10% 60%)" strokeDasharray="3 3" />
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] shadow-soft"
          style={{ insetInlineStart: `${(xFor(hoverIndex!) / WIDTH) * 100}%`, transform: "translateX(-50%)" }}
        >
          <p className="font-bold text-ink">{formatDateEn(hovered.x)}</p>
          <p className="text-ink-soft">
            الحالية: <span className="font-bold text-ink">{formatValue(hovered.y)}</span>
          </p>
          {hoveredPrev && (
            <p className="text-ink-soft">
              السابقة: <span className="font-semibold">{formatValue(hoveredPrev.y)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
