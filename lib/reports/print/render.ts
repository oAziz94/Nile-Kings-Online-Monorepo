/**
 * Backlog 10.14 — print-ready PDF page per admin report tab. Plain server-rendered HTML (no
 * React hydration, no client fetch): the route handler builds a `PrintPageInput` from the same
 * report functions the on-screen tab and its API route call, and this module turns it into a
 * full HTML document. The model is the owner's hand-made `orders-by-governorate-ar.pdf`
 * (2026-09-14): logo + company name header, title, a subtitle naming the source and the
 * exclusions, period + generated date at the corner, four headline tiles, tables with a thin
 * share bar in the percentage column and a bold total row, a small grey footnote stating the
 * basis. Kept plain and printable: black text on white, one accent colour for the bars, no
 * shadows.
 */

export type PrintTile = { label: string; value: string; hint?: string };

/** A percentage/share column gets a thin share bar behind its text. `sharePct` is the bar's
 * *width*, already normalised by the caller to the table's own largest row (backlog 10.14
 * PM review — "scale to the largest row so the top row's bar is full width, not to 100%",
 * per the owner's model PDF); `text` is always the real, un-normalised value. */
export type PrintTableCell = { text: string; sharePct?: number };

export type PrintTable = {
  title: string;
  columns: string[];
  rows: PrintTableCell[][];
  /** Bold total row, same column count as `columns`; a cell may be "" (no meaningful total,
   * e.g. a label or a rate column). */
  totalRow?: string[];
  note?: string;
};

export type PrintPageInput = {
  tabLabel: string;
  title: string;
  subtitle: string;
  periodLabel: string;
  generatedAtLabel: string;
  tiles: PrintTile[];
  /** One small line directly under the tiles (backlog 10.14 PM review — e.g. sales' نسبة
   * الإلغاء, computed over every order regardless of the accomplished/active filter, doesn't
   * belong in the tile row itself but still needs to be on the page). */
  subline?: string;
  tables: PrintTable[];
  footnote?: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTile(t: PrintTile): string {
  return `<div class="tile">
    <p class="tile-label">${esc(t.label)}</p>
    <p class="tile-value">${esc(t.value)}</p>
    ${t.hint ? `<p class="tile-hint">${esc(t.hint)}</p>` : ""}
  </div>`;
}

function renderCell(cell: PrintTableCell): string {
  if (cell.sharePct === undefined) return `<td>${esc(cell.text)}</td>`;
  const pct = Math.max(0, Math.min(100, cell.sharePct));
  return `<td class="share-cell">
    <div class="share-bar"><div class="share-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
    <span class="share-text">${esc(cell.text)}</span>
  </td>`;
}

function renderTable(t: PrintTable): string {
  const head = `<tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const body = t.rows.map((row) => `<tr>${row.map(renderCell).join("")}</tr>`).join("");
  const total = t.totalRow
    ? `<tr class="total-row">${t.totalRow.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`
    : "";
  return `<section class="table-block">
    <h2>${esc(t.title)}</h2>
    <table>
      <thead>${head}</thead>
      <tbody>${body}${total}</tbody>
    </table>
    ${t.note ? `<p class="table-note">${esc(t.note)}</p>` : ""}
  </section>`;
}

export function renderReportPrintPage(input: PrintPageInput): string {
  const tiles = input.tiles.map(renderTile).join("");
  const tables = input.tables.map(renderTable).join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${esc(input.title)} — نايل كينجز</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    color: #12162b;
    background: #fff;
    margin: 0;
    padding: 24px;
  }
  .toolbar {
    position: sticky;
    top: 0;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding-bottom: 16px;
    margin-bottom: 16px;
    border-bottom: 1px solid #e5e0d8;
  }
  .toolbar button {
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid #12162b;
    background: #12162b;
    color: #fff;
    cursor: pointer;
  }
  .toolbar button.secondary {
    background: #fff;
    color: #12162b;
  }
  header.doc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { height: 36px; width: auto; }
  .brand span { font-size: 16px; font-weight: 800; }
  .meta { text-align: left; font-size: 11px; color: #6b6558; line-height: 1.6; }
  h1.doc-title { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
  p.doc-subtitle { font-size: 12.5px; color: #4a4636; margin: 0 0 18px; }
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 22px;
  }
  .tile {
    border: 1px solid #e5e0d8;
    border-radius: 8px;
    padding: 12px 14px;
  }
  .tile-label { font-size: 11.5px; color: #6b6558; margin: 0 0 4px; }
  .tile-value { font-size: 20px; font-weight: 800; margin: 0; direction: ltr; text-align: right; }
  .tile-hint { font-size: 10.5px; color: #6b6558; margin: 4px 0 0; }
  .subline { font-size: 11.5px; color: #4a4636; margin: -14px 0 22px; }
  .table-block { margin-bottom: 22px; break-inside: avoid; }
  .table-block h2 { font-size: 14px; font-weight: 800; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  thead { display: table-header-group; }
  th, td {
    border-bottom: 1px solid #ece7dd;
    padding: 6px 8px;
    text-align: right;
  }
  th { color: #6b6558; font-weight: 700; font-size: 11px; }
  tr { break-inside: avoid; }
  tr.total-row td { font-weight: 800; border-top: 2px solid #12162b; border-bottom: none; }
  .share-cell { position: relative; }
  .share-bar { position: relative; background: #ece7dd; height: 12px; border-radius: 3px; width: 84px; display: inline-block; vertical-align: middle; margin-left: 8px; }
  .share-bar-fill { position: absolute; inset: 0; background: #b8860b; border-radius: 3px; }
  .share-text { direction: ltr; display: inline-block; }
  .table-note { font-size: 10.5px; color: #6b6558; margin: 4px 0 0; }
  .footnote { font-size: 11px; color: #8a8474; margin-top: 12px; }
  .page-footer { font-size: 10px; color: #8a8474; text-align: center; margin-top: 24px; }

  @page { size: A4 landscape; margin: 14mm; }
  @media print {
    .toolbar { display: none !important; }
    body { padding: 0; }
    .page-footer::after { content: "صفحة " counter(page) " من " counter(pages); }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" onclick="window.print()">طباعة / حفظ PDF</button>
    <button type="button" class="secondary" onclick="window.close()">إغلاق</button>
  </div>

  <header class="doc-header">
    <div class="brand">
      <img src="/logo.png" alt="" />
      <span>نايل كينجز</span>
    </div>
    <div class="meta">
      <div>${esc(input.periodLabel)}</div>
      <div>أُنشئ في ${esc(input.generatedAtLabel)}</div>
    </div>
  </header>

  <h1 class="doc-title">${esc(input.title)}</h1>
  <p class="doc-subtitle">${esc(input.subtitle)}</p>

  <div class="tiles">${tiles}</div>

  ${input.subline ? `<p class="subline">${esc(input.subline)}</p>` : ""}

  ${tables}

  ${input.footnote ? `<p class="footnote">${esc(input.footnote)}</p>` : ""}

  <p class="page-footer"></p>
</body>
</html>`;
}
