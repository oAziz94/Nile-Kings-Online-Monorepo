// Generates the admin-v2 artboards — SAME tokens/CSS/icons/primitives as partner-v2 (copied verbatim below); only nav + page bodies differ (.dc.html) from one shared shell + page bodies.
// Run: node design-canvas/partner-v2/build.mjs
import fs from "node:fs";
import path from "node:path";

const out = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

// ---- tokens (resolved from app/globals.css) ----
const T = {
  ground: "hsl(40 30% 98%)",
  stone100: "hsl(38 22% 93%)",
  stone200: "hsl(36 16% 87%)",
  stone300: "hsl(34 12% 76%)",
  ink: "hsl(228 22% 14%)",
  inkSoft: "hsl(225 10% 42%)",
  lapis900: "hsl(228 44% 9%)",
  lapis800: "hsl(228 40% 14%)",
  lapis700: "hsl(227 34% 20%)",
  lapis50: "hsl(228 40% 96%)",
  gold50: "hsl(42 70% 94%)",
  gold100: "hsl(42 62% 87%)",
  gold500: "hsl(42 78% 55%)",
  gold600: "hsl(38 74% 46%)",
  carn50: "hsl(9 60% 95%)",
  carn500: "hsl(9 68% 45%)",
  carn600: "hsl(8 64% 38%)",
  turq50: "hsl(178 42% 93%)",
  turq500: "hsl(178 52% 32%)",
  malBg: "hsl(152 42% 92%)",
  malText: "hsl(152 50% 24%)",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap');
  body { margin:0; font-family: Cairo, 'Segoe UI', Tahoma, sans-serif; color:${T.ink}; background:${T.ground}; -webkit-font-smoothing:antialiased; }
  a { color:${T.lapis800}; text-decoration:none; } a:hover { color:${T.gold600}; }
  * { box-sizing:border-box; }
  .num { direction:ltr; unicode-bidi:isolate; font-variant-numeric: tabular-nums; }
  .card { background:#fff; border-radius:16px; box-shadow: 0 1px 2px rgba(20,24,40,.04), 0 10px 28px -14px rgba(20,24,40,.12); }
  .card-h { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 20px 0 20px; }
  .card-t { font-size:15px; font-weight:800; margin:0; }
  .card-s { font-size:12px; color:${T.inkSoft}; margin:2px 0 0 0; }
  .link { font-size:12px; font-weight:700; color:${T.lapis800}; display:inline-flex; align-items:center; gap:4px; }
  .nav a, .nav div.item { display:flex; align-items:center; gap:10px; border-radius:10px; padding:11px 12px; font-size:14px; font-weight:600; color:${T.inkSoft}; }
  .nav .active { background:${T.lapis50}; color:${T.lapis800}; }
  .nav .sec { font-size:11px; font-weight:700; letter-spacing:.04em; color:${T.stone300}; padding:0 10px; margin:18px 0 6px 0; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:40px; padding:0 16px; border-radius:999px; font-size:13px; font-weight:700; border:1px solid transparent; white-space:nowrap; }
  .btn-p { background:${T.lapis800}; color:#fff; }
  .btn-s { background:#fff; color:${T.ink}; border-color:${T.stone200}; }
  .btn-g { background:${T.gold500}; color:${T.lapis900}; }
  .btn-sm { height:32px; padding:0 12px; font-size:12px; }
  .icon-btn { width:40px; height:40px; border-radius:999px; background:#fff; border:1px solid ${T.stone200}; display:inline-flex; align-items:center; justify-content:center; color:${T.ink}; }
  .pill { display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:3px 10px; font-size:12px; font-weight:700; line-height:18px; }
  .pill i { width:6px; height:6px; border-radius:999px; display:inline-block; }
  .pill-n { background:${T.stone100}; color:${T.inkSoft}; } .pill-n i { background:${T.stone300}; }
  .pill-i { background:${T.turq50}; color:${T.turq500}; } .pill-i i { background:${T.turq500}; }
  .pill-w { background:${T.gold50}; color:${T.gold600}; } .pill-w i { background:${T.gold500}; }
  .pill-s { background:${T.malBg}; color:${T.malText}; } .pill-s i { background:${T.malText}; }
  .pill-d { background:${T.carn50}; color:${T.carn600}; } .pill-d i { background:${T.carn500}; }
  .delta { display:inline-flex; align-items:center; gap:4px; border-radius:999px; padding:2px 8px; font-size:11px; font-weight:800; }
  .delta-up { background:${T.malBg}; color:${T.malText}; } .delta-down { background:${T.carn50}; color:${T.carn600}; } .delta-flat { background:${T.stone100}; color:${T.inkSoft}; }
  .well { width:40px; height:40px; border-radius:12px; background:${T.gold50}; color:${T.gold600}; display:inline-flex; align-items:center; justify-content:center; }
  .chip { display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 12px; border-radius:999px; border:1px solid ${T.stone200}; background:#fff; font-size:12px; font-weight:600; color:${T.ink}; }
  .chip.on { background:${T.lapis800}; color:#fff; border-color:${T.lapis800}; }
  .tabs { display:flex; gap:4px; border-bottom:1px solid ${T.stone200}; }
  .tab { padding:10px 14px; font-size:13px; font-weight:700; color:${T.inkSoft}; border-bottom:2px solid transparent; display:flex; align-items:center; gap:8px; }
  .tab.on { color:${T.lapis800}; border-bottom-color:${T.gold500}; }
  .cnt { background:${T.stone100}; color:${T.inkSoft}; border-radius:999px; padding:0 7px; font-size:11px; font-weight:800; line-height:18px; }
  .tab.on .cnt { background:${T.lapis50}; color:${T.lapis800}; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:right; font-size:12px; font-weight:800; color:${T.inkSoft}; background:${T.ground}; padding:10px 14px; }
  td { font-size:13px; padding:12px 14px; border-top:1px solid ${T.stone100}; vertical-align:middle; }
  .field { display:flex; flex-direction:column; gap:6px; }
  .field label { font-size:12px; font-weight:700; color:${T.inkSoft}; }
  .input { height:40px; border-radius:10px; border:1px solid ${T.stone200}; background:#fff; padding:0 12px; font-size:13px; display:flex; align-items:center; color:${T.ink}; }
  .search { display:flex; align-items:center; gap:8px; height:40px; border-radius:999px; border:1px solid ${T.stone200}; background:#fff; padding:0 14px; font-size:13px; color:${T.inkSoft}; }
  .meter { height:10px; border-radius:999px; background:${T.stone100}; overflow:hidden; }
  .meter i { display:block; height:100%; border-radius:999px; background:${T.lapis800}; }
  .toggle { width:38px; height:22px; border-radius:999px; background:${T.lapis800}; position:relative; } .toggle b { position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:999px; background:#fff; }
  .toggle.off { background:${T.stone300}; } .toggle.off b { left:19px; }
  .row { display:flex; align-items:center; gap:12px; }
`;

// ---- icons (lucide-style, stroke 2, 24 grid) ----
const ic = (paths, s = 17) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const I = {
  home: (s) => ic('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', s),
  truck: (s) => ic('<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>', s),
  box: (s) => ic('<path d="M21 8l-9-4-9 4 9 4 9-4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>', s),
  users: (s) => ic('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 016-4"/>', s),
  chart: (s) => ic('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>', s),
  cog: (s) => ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>', s),
  bell: (s) => ic('<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 004 0"/>', s),
  store: (s) => ic('<path d="M3 9l1-5h16l1 5"/><path d="M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0"/><path d="M5 12v8h14v-8"/>', s),
  out: (s) => ic('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>', s),
  search: (s) => ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', s),
  cal: (s) => ic('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', s),
  plus: (s) => ic('<path d="M12 5v14M5 12h14"/>', s),
  arrL: (s) => ic('<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>', s),
  chevL: (s) => ic('<path d="M15 18l-6-6 6-6"/>', s),
  chevR: (s) => ic('<path d="M9 18l6-6-6-6"/>', s),
  chevD: (s) => ic('<path d="M6 9l6 6 6-6"/>', s),
  print: (s) => ic('<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v7H6z"/>', s),
  dl: (s) => ic('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>', s),
  ul: (s) => ic('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>', s),
  check: (s) => ic('<path d="M20 6L9 17l-5-5"/>', s),
  clock: (s) => ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', s),
  alert: (s) => ic('<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>', s),
  coins: (s) => ic('<circle cx="8" cy="8" r="5"/><path d="M14.5 9.5a5 5 0 11-5 5"/>', s),
  cart: (s) => ic('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/>', s),
  pkg: (s) => ic('<path d="M16.5 9.4L7.5 4.2"/><path d="M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4a2 2 0 001-1.7z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/>', s),
  menu: (s) => ic('<path d="M4 6h16M4 12h16M4 18h16"/>', s),
  filter: (s) => ic('<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>', s),
  eye: (s) => ic('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>', s),
  trend: (s) => ic('<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>', s),
  layers: (s) => ic('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>', s),
  map: (s) => ic('<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>', s),
  file: (s) => ic('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>', s),
};

// ---- primitives ----
const kpi = (label, value, sub, delta, icon, unit = "") => `
<div class="card" style="padding:20px; display:flex; flex-direction:column; gap:14px;">
  <div style="display:flex; align-items:center; justify-content:space-between;">
    <span style="font-size:12px; font-weight:700; color:${T.inkSoft};">${label}</span>
    <span class="well">${icon(18)}</span>
  </div>
  <div style="display:flex; align-items:baseline; gap:6px;">
    <span class="num" style="font-size:26px; font-weight:800; letter-spacing:-.01em;">${value}</span>
    ${unit ? `<span style="font-size:12px; font-weight:700; color:${T.inkSoft};">${unit}</span>` : ""}
  </div>
  <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
    <span style="font-size:12px; color:${T.inkSoft};">${sub}</span>
    ${delta}
  </div>
</div>`;
const up = (t) => `<span class="delta delta-up"><span class="num">${t}</span></span>`;
const down = (t) => `<span class="delta delta-down"><span class="num">${t}</span></span>`;
const flat = (t) => `<span class="delta delta-flat"><span class="num">${t}</span></span>`;
const pill = (k, t) => `<span class="pill pill-${k}"><i></i>${t}</span>`;
const st = { CREATED: pill("i", "بانتظار التأكيد"), CONFIRMED: pill("w", "مؤكد"), PROCESSING: pill("w", "قيد التجهيز"), READY: pill("i", "جاهز للتسليم"), SHIPPED: pill("n", "تم الشحن"), DELIVERED: pill("s", "تم التسليم"), CANCELLED: pill("d", "ملغي") };

// single-hue lapis line chart (30 points), revenue only — one series, no legend
function lineChart(w, h, pts, labels, hue = T.lapis800) {
  const padL = 44, padR = 12, padT = 16, padB = 28;
  const max = Math.max(...pts) * 1.1, min = 0;
  const x = (i) => padL + (i / (pts.length - 1)) * (w - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(pts.length - 1).toFixed(1)} ${y(0)} L${x(0)} ${y(0)} Z`;
  const grid = [0, .25, .5, .75, 1].map((f) => { const yy = y(min + f * (max - min)); return `<line x1="${padL}" x2="${w - padR}" y1="${yy}" y2="${yy}" stroke="${T.stone100}"/><text x="${padL - 8}" y="${yy + 4}" font-size="10" fill="${T.inkSoft}" text-anchor="end" font-family="Cairo">${Math.round((min + f * (max - min)) / 1000)}k</text>`; }).join("");
  const xl = labels.map((l, i) => `<text x="${x(i * (pts.length - 1) / (labels.length - 1))}" y="${h - 8}" font-size="10" fill="${T.inkSoft}" text-anchor="middle" font-family="Cairo">${l}</text>`).join("");
  const last = pts.length - 1;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="direction:ltr; display:block;">
    ${grid}${xl}
    <path d="${area}" fill="${hue}" opacity=".06"/>
    <path d="${d}" fill="none" stroke="${hue}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${x(last)}" cy="${y(pts[last])}" r="4" fill="${hue}" stroke="#fff" stroke-width="2"/>
  </svg>`;
}
function barChart(w, h, vals, labels, hue = T.lapis800) {
  const padL = 44, padR = 12, padT = 12, padB = 28;
  const max = Math.max(...vals) * 1.15;
  const bw = (w - padL - padR) / vals.length;
  const y = (v) => padT + (1 - v / max) * (h - padT - padB);
  const grid = [0, .5, 1].map((f) => { const yy = y(f * max); return `<line x1="${padL}" x2="${w - padR}" y1="${yy}" y2="${yy}" stroke="${T.stone100}"/><text x="${padL - 8}" y="${yy + 4}" font-size="10" fill="${T.inkSoft}" text-anchor="end" font-family="Cairo">${Math.round(f * max / 1000)}k</text>`; }).join("");
  const bars = vals.map((v, i) => { const x = padL + i * bw + bw * .25; const yy = y(v); return `<rect x="${x}" y="${yy}" width="${bw * .5}" height="${y(0) - yy}" rx="4" ry="4" fill="${hue}"/><text x="${x + bw * .25}" y="${h - 8}" font-size="10" fill="${T.inkSoft}" text-anchor="middle" font-family="Cairo">${labels[i]}</text>`; }).join("");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="direction:ltr; display:block;">${grid}${bars}</svg>`;
}


// =====================================================================================
// Admin v2 — the operations console (docs/redesign/06-admin-v2.md). Same tokens, CSS, icons
// and primitives as partner v2 (copied above so the two canvases stay byte-identical in
// language); only the shell's nav/lockup and the page bodies differ.
// =====================================================================================

I.inbox = (s) => ic('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v7a2 2 0 01-2 2H4a2 2 0 01-2-2v-7z"/>', s);
I.hand = (s) => ic('<path d="M11 11V5a1.5 1.5 0 013 0v6"/><path d="M14 10V4a1.5 1.5 0 013 0v7"/><path d="M17 11V6a1.5 1.5 0 013 0v8a7 7 0 01-7 7h-1a7 7 0 01-6-3.4L3.4 12a1.6 1.6 0 012.6-1.8L8 12V7a1.5 1.5 0 013 0"/>', s);
I.tag = (s) => ic('<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8z"/><circle cx="7" cy="7" r="1.5"/>', s);
I.image = (s) => ic('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>', s);
I.folder = (s) => ic('<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>', s);
I.ticket = (s) => ic('<path d="M2 9a3 3 0 010 6v4h20v-4a3 3 0 010-6V5H2z"/><path d="M13 5v14"/>', s);
I.msg = (s) => ic('<path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>', s);
I.log = (s) => ic('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>', s);
I.grip = (s) => ic('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>', s);
I.x = (s) => ic('<path d="M18 6L6 18M6 6l12 12"/>', s);
I.pause = (s) => ic('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', s);
I.shield = (s) => ic('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>', s);
I.refresh = (s) => ic('<path d="M21 12a9 9 0 11-2.6-6.4"/><path d="M21 3v6h-6"/>', s);

const rev30 = [1210, 1380, 1120, 1540, 1720, 1660, 1490, 1830, 1910, 1750, 1620, 1980, 2140, 2010, 1870, 2260, 2390, 2180, 2050, 2420, 2610, 2480, 2330, 2570, 2750, 2690, 2540, 2810, 2960, 2870];

const NAV = [
  { sec: "التشغيل", items: [["اليوم", I.home, "today", "6"], ["الطلبات", I.truck, "orders", ""], ["أسئلة العملاء", I.msg, "tickets", "3"]] },
  { sec: "الشبكة", items: [["الشركاء", I.users, "partners", ""]] },
  { sec: "الكتالوج", items: [["المنتجات", I.tag, "products", ""], ["الصور", I.image, "media", ""], ["الفئات", I.folder, "categories", ""], ["الكوبونات", I.ticket, "coupons", ""]] },
  { sec: "الأشخاص", items: [["العملاء", I.users, "clients", ""]] },
  { sec: "المتابعة", items: [["التقارير", I.chart, "reports", ""], ["السجل", I.log, "audit", ""], ["الإعدادات", I.cog, "settings", ""]] },
];
function sidebar(active) {
  return `<aside style="width:248px; flex:none; background:#fff; border-left:1px solid ${T.stone200}; padding:20px 14px; display:flex; flex-direction:column; gap:6px; min-height:100%;">
  <div class="row" style="gap:10px; padding:0 6px 14px 6px;">
    <img src="logo-lapis-mark.png" alt="" style="width:34px; height:34px; object-fit:contain;">
    <div><div style="font-size:14px; font-weight:800; line-height:1.1;">قطن ملوك النيل</div><div style="font-size:11px; color:${T.inkSoft};">لوحة الإدارة</div></div>
  </div>
  <div class="card" style="box-shadow:none; background:${T.ground}; border-radius:12px; padding:10px 12px; display:flex; align-items:center; gap:10px;">
    <div style="width:36px; height:36px; border-radius:999px; background:${T.lapis800}; color:${T.gold500}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px;">ع</div>
    <div style="min-width:0;"><div style="font-size:13px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">عمر عبد العزيز</div><div style="font-size:11px; color:${T.inkSoft};">مسؤول · المصنع</div></div>
    <span style="margin-right:auto; color:${T.inkSoft};">${I.chevD(14)}</span>
  </div>
  <nav class="nav" style="display:flex; flex-direction:column; gap:2px;">
    ${NAV.map((g) => `<div class="sec">${g.sec}</div>` + g.items.map(([l, icon, k, badge]) => `<div class="item${k === active ? " active" : ""}">${icon(17)}<span style="flex:1;">${l}</span>${badge ? `<span class="num" style="background:${T.gold500}; color:${T.lapis900}; border-radius:999px; padding:0 7px; font-size:11px; font-weight:800; line-height:18px;">${badge}</span>` : ""}</div>`).join("")).join("")}
  </nav>
  <div style="margin-top:auto; border-top:1px solid ${T.stone200}; padding-top:10px;"><div class="item" style="display:flex; align-items:center; gap:10px; padding:8px 12px; font-size:13px; font-weight:600; color:${T.inkSoft};">${I.chevR(16)} طيّ القائمة</div></div>
</aside>`;
}
function topbar(title, crumb, extra = "") {
  return `<header style="display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 28px 0 28px;">
  <div><h1 style="margin:0; font-size:20px; font-weight:800;">${title}</h1><div style="font-size:12px; color:${T.inkSoft}; margin-top:2px;">${crumb}</div></div>
  <div class="row" style="gap:10px;">
    ${extra}
    <span class="icon-btn" style="position:relative;">${I.bell(18)}<b style="position:absolute; top:8px; right:9px; width:8px; height:8px; border-radius:999px; background:${T.carn500}; border:2px solid #fff;"></b></span>
    <span class="icon-btn">${I.store(18)}</span>
  </div>
</header>`;
}
function page(active, title, crumb, body, extra = "", h = 900) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>${CSS}</style></helmet>
<div dir="rtl" style="width:1440px; min-height:${h}px; display:flex; background:${T.ground};">
  ${sidebar(active)}
  <main style="flex:1; min-width:0; display:flex; flex-direction:column; gap:20px; padding-bottom:28px;">
    ${topbar(title, crumb, extra)}
    <div style="padding:0 28px; display:flex; flex-direction:column; gap:20px;">
      ${body}
    </div>
  </main>
</div>
</x-dc>
</body>
</html>`;
}
const tabs = (items, on) => `<div class="tabs">${items.map(([l, c]) => `<span class="tab${l === on ? " on" : ""}">${l}${c ? ` <span class="cnt">${c}</span>` : ""}</span>`).join("")}</div>`;
const thead = (cols) => `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
const chk = (on) => `<span style="display:inline-block; width:16px; height:16px; border-radius:4px; border:1.5px solid ${on ? T.lapis800 : T.stone300}; background:${on ? T.lapis800 : "#fff"};"></span>`;
const avatar = (t, bg = T.lapis800, fg = T.gold500) => `<span style="width:28px; height:28px; border-radius:999px; background:${bg}; color:${fg}; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; flex:none;">${t}</span>`;
const partnerCell = (name, sub) => `<span class="row" style="gap:8px;">${avatar(name.slice(0, 1))}<span><div style="font-size:13px; font-weight:700;">${name}</div><div style="font-size:11px; color:${T.inkSoft};">${sub}</div></span></span>`;
const note = (t, tone = T.gold50) => `<div class="card" style="padding:12px 16px; background:${tone}; box-shadow:none; font-size:12px; line-height:1.7;">${t}</div>`;
const files = {};

// 1. اليوم — the queue first, numbers second, recent activity last
{
  const q = (title, count, tone, icon, rows, cta) => `
<div class="card" style="display:flex; flex-direction:column; overflow:hidden;">
  <div class="row" style="justify-content:space-between; padding:14px 18px 8px 18px;">
    <div class="row" style="gap:8px; min-width:0;"><span class="well" style="width:32px; height:32px; border-radius:10px; flex:none;">${icon(16)}</span><span style="font-size:13.5px; font-weight:800; white-space:nowrap;">${title}</span>${pill(tone, count)}</div>
    <a class="link" href="#" style="white-space:nowrap; flex:none;">${cta} ${I.chevL(12)}</a>
  </div>
  ${rows.map((r) => `<div class="row" style="padding:9px 18px; border-top:1px solid ${T.stone100}; gap:12px;">
    <span style="font-size:13px; font-weight:700; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r[0]}</span>
    <span style="font-size:12px; color:${T.inkSoft}; white-space:nowrap;">${r[1]}</span>
    <span class="btn ${r[3] || "btn-s"} btn-sm">${r[2]}</span>
  </div>`).join("")}
</div>`;
  const body = `
<div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:16px;">
  ${q("طلبات بلا شريك", "6", "d", I.alert, [
    ["#NK-10488 · منى عبد الرحمن · أسوان", "منذ 3 ساعات", "إسناد", "btn-p"],
    ["#NK-10486 · طارق سمير · مطروح", "منذ 5 ساعات", "إسناد", "btn-p"],
    ["#NK-10480 · هدى علي · الوادي الجديد", "منذ يوم", "إسناد", "btn-p"],
  ], "كل الطلبات بلا شريك")}
  ${q("متأخرة عند الشريك", "9", "d", I.clock, [
    ["#NK-10431 · وكيل القاهرة · مؤكد", "تجاوز المهلة بـ 7 ساعات", "فتح"],
    ["#NK-10427 · موزع القليوبية · قيد التجهيز", "تجاوز المهلة بـ 4 ساعات", "فتح"],
    ["#NK-10419 · وكيل الجيزة · بانتظار التأكيد", "تجاوز المهلة بـ ساعتين", "فتح"],
  ], "كل المتأخرة")}
  ${q("أسئلة بانتظار الرد", "3", "w", I.msg, [
    ["تأخير في التوصيل · #NK-10402", "منذ ساعة", "رد", "btn-p"],
    ["تعديل العنوان أو الهاتف · #NK-10398", "منذ 3 ساعات", "رد", "btn-p"],
    ["تأخير في التوصيل · #NK-10377", "منذ يوم", "رد", "btn-p"],
  ], "صندوق الأسئلة")}
  ${q("طلبات شراكة جديدة", "2", "i", I.hand, [
    ["محمد فتحي · موزع · الإسكندرية", "منذ يومين", "مراجعة"],
    ["نورهان صلاح · وكيل · المنصورة", "منذ 4 أيام", "مراجعة"],
  ], "كل الطلبات")}
  ${q("أصناف نافدة أو قاربت", "14", "w", I.pkg, [
    ["3030-01 · XXL أسود · وكيل القاهرة", "0 قابل للبيع · يبيع 3/أسبوع", "فتح"],
    ["8902-5 · XXL أبيض · موزع القليوبية", "2 قابل للبيع · الحد 5", "فتح"],
    ["NK-9090-11 · XXL · وكيل الجيزة", "1 قابل للبيع · الحد 5", "فتح"],
  ], "مخزون الشبكة")}
  ${q("مستحقات شركاء", "4", "w", I.coins, [
    ["وكيل القاهرة · قسط 12,000 ج.م", "استحق منذ 5 أيام", "تسجيل دفعة"],
    ["موزع القليوبية · قسط 6,500 ج.م", "استحق أمس", "تسجيل دفعة"],
    ["وكيل الجيزة · دفعة مقدمة 20,000 ج.م", "يستحق غدًا", "فتح"],
  ], "الحساب المالي")}
</div>
<div style="display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:16px;">
  ${kpi("طلبات اليوم", "63", "أمس 58", up("+5"), I.cart)}
  ${kpi("إيراد مُسلَّم · 7 أيام", "184,200", "الأسبوع الماضي 171,900", up("+7%"), I.coins, "ج.م")}
  ${kpi("نسبة الإلغاء · 30 يومًا", "6.8%", "الشهر الماضي 8.1%", up("−1.3 نقطة"), I.x)}
  ${kpi("في الموعد · 30 يومًا", "91%", "الشهر الماضي 88%", up("+3 نقاط"), I.check)}
</div>
<div style="display:grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap:16px;">
  <div class="card">
    <div class="card-h"><div><h2 class="card-t">الطلبات آخر 30 يومًا · الشبكة كلها</h2><p class="card-s">مقارنة بالفترة السابقة ${up("+9%")}</p></div><div class="row" style="gap:6px;"><span class="chip on">الطلبات</span><span class="chip">الإيراد</span><span class="chip">${I.cal(14)} 30 يومًا ${I.chevD(14)}</span></div></div>
    <div style="padding:8px 12px 12px 12px;">${lineChart(760, 200, rev30, ["15 أغسطس", "22 أغسطس", "29 أغسطس", "5 سبتمبر", "13 سبتمبر"])}</div>
  </div>
  <div class="card" style="display:flex; flex-direction:column;">
    <div class="card-h" style="padding-bottom:8px;"><div><h2 class="card-t">آخر النشاط</h2><p class="card-s">من السجل · من فعل ماذا ومتى</p></div><a class="link" href="#">السجل كاملًا ${I.chevL(12)}</a></div>
    ${[["جمال (وكيل القاهرة)", "أكّد الطلب #NK-10482", "قبل 4 دقائق"], ["أنت", "غيّرت نسبة الشراء لموزع القليوبية 75% → 70%", "قبل 25 دقيقة"], ["أنت", "أسندت #NK-10479 إلى وكيل الجيزة", "قبل ساعة"], ["سلمى (موزع القليوبية)", "سجّلت استلام 120 قطعة من المصنع", "قبل ساعتين"], ["أنت", "رفعت 6 صور لمنتج 3030-01", "أمس"]].map((r) => `<div style="padding:9px 20px; border-top:1px solid ${T.stone100}; font-size:12px; line-height:1.6;"><b>${r[0]}</b> ${r[1]}<div style="color:${T.inkSoft}; font-size:11px;">${r[2]}</div></div>`).join("")}
  </div>
</div>`;
  files["Main.dc.html"] = page("today", "اليوم", "السبت 13 سبتمبر 2026 · كل ما يحتاجك الآن", body, `<span class="search" style="width:280px;">${I.search(16)} ابحث برقم الطلب أو الهاتف أو الشريك</span>`, 1180);
}

// 2. الطلبات — the network pipeline: partner column, بلا شريك stage, assign
{
  const rows = [
    ["#NK-10488", "منى عبد الرحمن", "أسوان", "—", "3", "640", "CREATED", "بلا شريك · 3 ساعات", "إسناد", "btn-p", true],
    ["#NK-10486", "طارق سمير", "مطروح", "—", "1", "220", "CREATED", "بلا شريك · 5 ساعات", "إسناد", "btn-p", true],
    ["#NK-10482", "منى صبري", "مدينة نصر · القاهرة", "وكيل القاهرة", "3", "640", "CONFIRMED", "25 دقيقة", "فتح", "btn-s"],
    ["#NK-10481", "أحمد سامي", "المعادي · القاهرة", "وكيل القاهرة", "5", "1,120", "CREATED", "40 دقيقة", "فتح", "btn-s"],
    ["#NK-10431", "هاني مصطفى", "الشروق · القاهرة", "وكيل القاهرة", "3", "760", "CONFIRMED", "31 ساعة · متأخر", "فتح", "btn-s"],
    ["#NK-10427", "دينا فؤاد", "العبور · القليوبية", "موزع القليوبية", "2", "520", "PROCESSING", "52 ساعة · متأخر", "فتح", "btn-s"],
    ["#NK-10412", "ريم حسن", "سموحة · الإسكندرية", "وكيل الإسكندرية", "1", "240", "SHIPPED", "يومان", "فتح", "btn-s"],
    ["#NK-10398", "خالد عمر", "الدقي · الجيزة", "وكيل الجيزة", "4", "980", "DELIVERED", "3 أيام", "فتح", "btn-s"],
  ];
  const body = `
<div class="card" style="overflow:hidden;">
  <div style="padding:8px 20px 0 20px;">${tabs([["الكل", "2,140"], ["بلا شريك", "6"], ["بانتظار التأكيد", "41"], ["مؤكد", "291"], ["قيد التجهيز", "64"], ["جاهز للتسليم", "38"], ["تم الشحن", "112"], ["تم التسليم", "1,467"], ["ملغي", "121"]], "الكل")}</div>
  <div class="row" style="padding:14px 20px; gap:10px; flex-wrap:wrap;">
    <span class="search" style="width:280px;">${I.search(16)} رقم الطلب أو العميل أو الهاتف</span>
    <span class="chip">الشريك ${I.chevD(14)}</span>
    <span class="chip">المحافظة ${I.chevD(14)}</span>
    <span class="chip">طريقة الدفع ${I.chevD(14)}</span>
    <span class="chip">${I.cal(14)} آخر 7 أيام ${I.chevD(14)}</span>
    <span class="chip">${I.alert(14)} متأخرة فقط</span>
    <span style="margin-right:auto;" class="row" ><span class="btn btn-s">${I.dl(16)} تصدير</span></span>
  </div>
  <div class="row" style="margin:0 20px 12px 20px; padding:10px 16px; border-radius:12px; background:${T.lapis50}; gap:12px;">
    <span style="font-size:13px; font-weight:800; color:${T.lapis800};">طلبان محددان · بلا شريك</span>
    <span class="btn btn-p btn-sm">إسناد إلى شريك ${I.chevD(14)}</span>
    <span class="btn btn-s btn-sm">تغيير الحالة ${I.chevD(14)}</span>
    <span class="btn btn-s btn-sm">${I.print(14)} قائمة التجهيز</span>
    <a class="link" href="#" style="margin-right:auto;">إلغاء التحديد</a>
  </div>
  <table>
    ${thead([chk(false), "رقم الطلب", "العميل", "المنطقة", "الشريك", "القطع", "الإجمالي", "الحالة", "منذ", "الإجراء"])}
    <tbody>${rows.map((r) => `<tr${r[10] ? ` style="background:${T.carn50}66;"` : ""}>
      <td>${chk(!!r[10])}</td><td class="num" style="font-weight:700; color:${T.lapis800};">${r[0]}</td><td style="font-weight:700;">${r[1]}</td><td style="color:${T.inkSoft};">${r[2]}</td>
      <td>${r[3] === "—" ? pill("d", "بلا شريك") : `<span style="font-weight:700;">${r[3]}</span>`}</td>
      <td class="num">${r[4]}</td><td class="num" style="font-weight:800;">${r[5]} <span style="font-size:11px; color:${T.inkSoft};">ج.م</span></td>
      <td>${st[r[6]]}${r[7].includes("متأخر") ? ` ${pill("d", "متأخرة")}` : ""}</td><td style="color:${T.inkSoft}; font-size:12px;">${r[7].replace(" · متأخر", "")}</td>
      <td><span class="row" style="gap:6px;"><span class="btn ${r[9]} btn-sm">${r[8]}</span>${r[3] !== "—" ? `<span class="btn btn-s btn-sm">${I.arrL(14)} التالي</span>` : ""}</span></td>
    </tr>`).join("")}</tbody>
  </table>
  <div class="row" style="justify-content:space-between; padding:14px 20px;"><span style="font-size:12px; color:${T.inkSoft};">عرض 1–8 من 2,140</span><div class="row" style="gap:6px;">${["‹", "1", "2", "3", "…", "268", "›"].map((p, i) => `<span class="num" style="width:30px; height:30px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; ${i === 1 ? `background:${T.lapis800}; color:#fff;` : `border:1px solid ${T.stone200}; color:${T.inkSoft};`}">${p}</span>`).join("")}</div></div>
</div>`;
  files["Orders.dc.html"] = page("orders", "الطلبات", "كل الشبكة · مرحلة مرحلة · الشريك عمود لا شاشة", body, `<span class="btn btn-p">${I.plus(16)} طلب يدوي</span>`, 900);
}

// 3. تفاصيل الطلب — partner v2 detail + admin powers: assign/reassign, proof, cancel with reason, the ticket
{
  const items = [["تي شيرت رجالي نصف كم سادة", "L · أسود", "3030-01-L-BLK", "2", "320", "640"], ["طقم أطفال فانلة كت وشورت", "6 · أبيض", "8902-5-6-WHT", "1", "180", "180"]];
  const tl = [["أُنشئ الطلب", "13 سبتمبر · 09:12 · العميل", "s"], ["أُسند إلى وكيل القاهرة", "13 سبتمبر · 09:13 · تلقائي", "s"], ["أكّده جمال (وكيل القاهرة)", "13 سبتمبر · 09:40", "s"], ["بدء التجهيز", "بانتظار الشريك · المهلة تنتهي 14 سبتمبر 09:40", "n"], ["جاهز للتسليم", "", "n"], ["تم التسليم", "", "n"]];
  const body = `
<div class="row" style="justify-content:space-between;">
  <div class="row" style="gap:12px;"><a class="link" href="#">${I.chevR(14)} الطلبات</a><span style="color:${T.stone300};">/</span><span class="num" style="font-size:16px; font-weight:800;">#NK-10476</span>${st.CONFIRMED}<span style="font-size:12px; color:${T.inkSoft};">الدفع عند الاستلام · أُنشئ 13 سبتمبر 09:12</span></div>
  <div class="row" style="gap:8px;"><span class="btn btn-s">${I.print(16)} طباعة</span><span class="btn btn-s" style="color:${T.carn600};">إلغاء الطلب…</span><span class="btn btn-p">تغيير الحالة ${I.chevD(14)}</span></div>
</div>
<div style="display:grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap:16px; align-items:start;">
  <div style="display:flex; flex-direction:column; gap:16px;">
    <div class="card" style="overflow:hidden;">
      <div class="card-h" style="padding-bottom:10px;"><h2 class="card-t">القطع (3)</h2><span class="chip">${I.print(14)} قائمة تجهيز</span></div>
      <table>${thead(["المنتج", "المقاس · اللون", "SKU", "الكمية", "السعر", "الإجمالي"])}
      <tbody>${items.map((r) => `<tr><td style="font-weight:700;">${r[0]}</td><td style="color:${T.inkSoft};">${r[1]}</td><td class="num" style="font-size:12px; color:${T.inkSoft};">${r[2]}</td><td class="num"><span class="input" style="width:64px; height:32px; display:inline-flex; justify-content:center;">${r[3]}</span></td><td class="num">${r[4]}</td><td class="num" style="font-weight:800;">${r[5]}</td></tr>`).join("")}
      <tr><td colspan="6" style="padding:10px 14px;"><span class="row" style="gap:8px;"><span class="search" style="width:340px; height:34px;">${I.search(14)} أضف صنفًا من مخزون الشريك…</span><span class="btn btn-s btn-sm">إضافة</span><a class="link" href="#" style="margin-right:auto;">حفظ البنود وإعادة الحساب</a></span></td></tr></tbody></table>
      <div style="display:flex; justify-content:flex-start; padding:14px 20px; border-top:1px solid ${T.stone100};">
        <div style="width:300px; display:flex; flex-direction:column; gap:6px; font-size:13px;">
          <div class="row" style="justify-content:space-between;"><span style="color:${T.inkSoft};">القطع</span><span class="num">820</span></div>
          <div class="row" style="justify-content:space-between;"><span style="color:${T.inkSoft};">الشحن · مصر للبريد</span><span class="num">60</span></div>
          <div class="row" style="justify-content:space-between;"><span style="color:${T.inkSoft};">رسوم الدفع عند الاستلام</span><span class="num">18</span></div>
          <div class="row" style="justify-content:space-between; font-weight:800; font-size:15px; border-top:1px solid ${T.stone200}; padding-top:6px;"><span>الإجمالي</span><span class="num">898 ج.م</span></div>
        </div>
      </div>
    </div>
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:12px;">
      <div class="row" style="justify-content:space-between;"><h2 class="card-t">سؤال العميل</h2>${pill("w", "بانتظار الرد")}</div>
      <div style="font-size:12px; color:${T.inkSoft};">تأخير في التوصيل · 13 سبتمبر 11:02 · هاتف التواصل <span class="num">+20 100 123 4567</span></div>
      <div class="card" style="box-shadow:none; background:${T.ground}; padding:12px 14px; font-size:13px; line-height:1.7;">الطلب مؤكد من الصباح ولم يتصل بي أحد، متى يصل؟</div>
      <div class="input" style="height:auto; min-height:64px; align-items:flex-start; padding:10px 12px; color:${T.inkSoft};">اكتب ردًا يراه العميل تحت طلبه…</div>
      <div class="row" style="gap:8px;"><span class="btn btn-p btn-sm">إرسال الرد</span><span class="btn btn-s btn-sm">إغلاق السؤال</span></div>
    </div>
  </div>
  <div style="display:flex; flex-direction:column; gap:16px;">
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:10px; border:1px solid ${T.gold100};">
      <div class="row" style="justify-content:space-between;"><h2 class="card-t">الشريك المنفّذ</h2><a class="link" href="#">إعادة الإسناد…</a></div>
      ${partnerCell("وكيل القاهرة", "جمال السيد · مؤكد منذ 3 ساعات · في الموعد")}
      <div style="font-size:12px; color:${T.inkSoft}; line-height:1.7;">المخزون محجوز عند هذا الشريك. إعادة الإسناد تنقل الحجز إلى الشريك الجديد وتكتب قيدًا في دفتر المخزون لكليهما.</div>
      <div class="row" style="gap:8px;"><span class="btn btn-s btn-sm">${I.ul(14)} إثبات التسليم</span><span class="btn btn-s btn-sm">اتصال بالشريك</span></div>
    </div>
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:10px;">
      <h2 class="card-t">العميل والتوصيل</h2>
      <div style="font-size:14px; font-weight:800;">كريم ناجي</div>
      <div class="num" style="font-size:13px; color:${T.inkSoft};">+20 100 123 4567</div>
      <div style="font-size:13px; line-height:1.7;">التجمع الخامس · القاهرة<br>شارع التسعين الجنوبي، عمارة 14، الدور 3، شقة 7</div>
      <div class="row" style="gap:8px;"><span class="btn btn-s btn-sm">تعديل العنوان</span><span class="btn btn-s btn-sm">ملف العميل</span></div>
    </div>
    <div class="card" style="padding:18px 20px;">
      <h2 class="card-t" style="margin-bottom:12px;">سجل الطلب</h2>
      ${tl.map((t, i) => `<div style="display:flex; gap:12px; padding-bottom:${i < tl.length - 1 ? 14 : 0}px;"><div style="display:flex; flex-direction:column; align-items:center;"><span style="width:10px; height:10px; border-radius:999px; background:${t[2] === "s" ? T.lapis800 : T.stone300}; margin-top:4px;"></span>${i < tl.length - 1 ? `<span style="width:2px; flex:1; background:${T.stone200}; margin-top:4px;"></span>` : ""}</div><div><div style="font-size:13px; font-weight:700; color:${t[2] === "s" ? T.ink : T.inkSoft};">${t[0]}</div><div style="font-size:11px; color:${T.inkSoft};">${t[1]}</div></div></div>`).join("")}
    </div>
  </div>
</div>`;
  files["OrderDetail.dc.html"] = page("orders", "تفاصيل الطلب", "الطلبات · #NK-10476 · وكيل القاهرة", body, "", 1000);
}

// 4. الشركاء — the hub list with health, and the tabs that absorb applications, routing, network stock
{
  const rows = [
    ["وكيل القاهرة", "وكيل · القاهرة", "142", "4", "3%", "18", "38,500", "s", "نشط"],
    ["موزع القليوبية", "موزع · القليوبية · تابع لوكيل القاهرة", "61", "3", "5%", "9", "12,700", "w", "نشط"],
    ["وكيل الجيزة", "وكيل · الجيزة", "88", "1", "1%", "31", "0", "s", "نشط"],
    ["وكيل الإسكندرية", "وكيل · الإسكندرية", "54", "0", "0%", "44", "6,200", "s", "نشط"],
    ["موزع المنصورة", "موزع · الدقهلية · تابع لوكيل الإسكندرية", "12", "2", "17%", "4", "9,900", "d", "نشط"],
    ["وكيل أسيوط", "وكيل · أسيوط", "0", "0", "—", "—", "0", "n", "غير نشط"],
  ];
  const body = `
<div class="card" style="overflow:hidden;">
  <div style="padding:8px 20px 0 20px;">${tabs([["الشركاء", "6"], ["طلبات الشراكة", "2"], ["التوجيه", ""], ["مخزون الشبكة", "14"]], "الشركاء")}</div>
  <div class="row" style="padding:14px 20px; gap:10px; flex-wrap:wrap;">
    <span class="search" style="width:260px;">${I.search(16)} اسم الشريك أو الهاتف</span>
    <span class="chip">النوع ${I.chevD(14)}</span><span class="chip">المحافظة ${I.chevD(14)}</span><span class="chip">${I.alert(14)} يحتاج انتباه</span>
    <span style="margin-right:auto;" class="row" style="gap:8px;"><span class="btn btn-s">${I.dl(16)} تصدير</span><span class="btn btn-p">${I.plus(16)} شريك جديد</span></span>
  </div>
  <table>
    ${thead(["الشريك", "طلبات مفتوحة", "متأخرة", "نسبة التأخير", "تغطية المخزون", "مستحق للمصنع", "الحالة", ""])}
    <tbody>${rows.map((r) => `<tr>
      <td>${partnerCell(r[0], r[1])}</td><td class="num">${r[2]}</td><td class="num" style="font-weight:700; color:${r[3] !== "0" ? T.carn600 : T.ink};">${r[3]}</td><td class="num">${r[4]}</td>
      <td>${r[5] === "—" ? "—" : `<span class="row" style="gap:8px;"><span class="meter" style="width:70px;"><i style="width:${Math.min(100, Number(r[5]) * 2.5)}%; background:${r[7] === "d" ? T.carn500 : r[7] === "w" ? T.gold500 : T.lapis800};"></i></span><span class="num" style="font-size:12px;">${r[5]} يوم</span></span>`}</td>
      <td class="num" style="font-weight:800;">${r[6]} <span style="font-size:11px; color:${T.inkSoft};">ج.م</span></td><td>${pill(r[7] === "n" ? "n" : "s", r[8])}</td>
      <td><span class="btn btn-s btn-sm">فتح</span></td>
    </tr>`).join("")}</tbody>
  </table>
</div>
${note(`<b>التبويبات الثلاثة الأخرى</b> تعيش هنا لا في القائمة: <b>طلبات الشراكة</b> (مراجعة وقبول وتحويل إلى شريك، مع الطلبات المعلقة في الشارة)، <b>التوجيه</b> (مصفوفة المحافظات — لوحة مستقلة على هذا الكانفس)، <b>مخزون الشبكة</b> (كل الشركاء × الأصناف تحت الحد — لوحة مستقلة).`)}`;
  files["Partners.dc.html"] = page("partners", "الشركاء", "6 شركاء · 2 طلب شراكة · 6 محافظات مُغطّاة", body, "", 900);
}

// 5. ملف الشريك — الحساب المالي tab (rate, receipts, payments, balance)
{
  const ptabs = tabs([["الملف", ""], ["الأداء", ""], ["الطلبات", "142"], ["المخزون", ""], ["الحساب المالي", ""], ["الإعدادات", ""]], "الحساب المالي");
  const receipts = [["#R-2041", "12 سبتمبر", "120 قطعة", "المصنع (أنت)", "31,200", "75%"], ["#R-2036", "3 سبتمبر", "80 قطعة", "الشريك", "20,800", "75%"], ["#R-2019", "21 أغسطس", "200 قطعة", "الشريك", "52,000", "75%"]];
  const payments = [["12 سبتمبر", "قسط", "12,000", "مرجع InstaPay 88213", "أنت"], ["1 سبتمبر", "قسط", "12,000", "—", "أنت"], ["21 أغسطس", "دفعة مقدمة", "20,000", "استلام #R-2019", "أنت"]];
  const body = `
<div class="row" style="justify-content:space-between;">
  <div class="row" style="gap:12px;"><a class="link" href="#">${I.chevR(14)} الشركاء</a>${partnerCell("وكيل القاهرة", "جمال السيد عبدالعزيز · وكيل · القاهرة · نشط منذ مارس 2026")}</div>
  <div class="row" style="gap:8px;"><span class="btn btn-s">اتصال</span><span class="btn btn-s" style="color:${T.carn600};">تعطيل الحساب…</span></div>
</div>
<div class="card" style="overflow:hidden;"><div style="padding:8px 20px 0 20px;">${ptabs}</div>
  <div style="padding:18px 20px; display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:16px;">
    ${kpi("استلم بسعر التكلفة", "104,000", "منذ البداية · 400 قطعة", flat("—"), I.pkg, "ج.م")}
    ${kpi("دفع للمصنع", "44,000", "3 دفعات", flat("—"), I.coins, "ج.م")}
    ${kpi("المستحق الآن", "60,000", "قسط 12,000 استحق منذ 5 أيام", down("متأخر"), I.alert, "ج.م")}
    ${kpi("نسبة الشراء", "75%", "هامشه 25% · الافتراضي 75%", flat("—"), I.tag)}
  </div>
  <div style="padding:0 20px 20px 20px; display:grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap:16px;">
    <div class="card" style="box-shadow:none; border:1px solid ${T.stone200}; overflow:hidden;">
      <div class="card-h" style="padding-bottom:10px;"><div><h2 class="card-t">استلامات من المصنع</h2><p class="card-s">من سجّلها: الشريك من بوابته أو أنت عند التسليم</p></div><span class="btn btn-p btn-sm">${I.plus(14)} تسجيل استلام باسمه</span></div>
      <table>${thead(["الإيصال", "التاريخ", "الكمية", "سجّله", "القيمة بالتكلفة", "النسبة وقتها"])}<tbody>${receipts.map((r) => `<tr><td class="num" style="font-weight:700; color:${T.lapis800};">${r[0]}</td><td>${r[1]}</td><td class="num">${r[2]}</td><td>${r[3] === "الشريك" ? pill("n", "الشريك") : pill("i", "المصنع")}</td><td class="num" style="font-weight:800;">${r[4]}</td><td class="num">${r[5]}</td></tr>`).join("")}</tbody></table>
    </div>
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div class="card" style="box-shadow:none; border:1px solid ${T.stone200}; overflow:hidden;">
        <div class="card-h" style="padding-bottom:10px;"><h2 class="card-t">الدفعات</h2><span class="btn btn-s btn-sm">${I.plus(14)} تسجيل دفعة</span></div>
        <table>${thead(["التاريخ", "النوع", "المبلغ", "مرجع"])}<tbody>${payments.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="num" style="font-weight:800;">${r[2]}</td><td style="font-size:12px; color:${T.inkSoft};">${r[3]}</td></tr>`).join("")}</tbody></table>
      </div>
      <div class="card" style="box-shadow:none; border:1px solid ${T.stone200}; padding:16px 20px; display:flex; flex-direction:column; gap:10px;">
        <h2 class="card-t">نسبة الشراء من سعر البيع</h2>
        <div class="row" style="gap:8px;"><span class="input num" style="width:90px;">75</span><span style="font-size:13px;">%</span><span class="btn btn-s btn-sm">حفظ</span></div>
        <div style="font-size:12px; color:${T.inkSoft}; line-height:1.6;">تُطبَّق على الاستلامات القادمة فقط؛ كل إيصال يحتفظ بنسبته وقت تسجيله. التغيير يُكتب في السجل.</div>
      </div>
    </div>
  </div>
</div>`;
  files["PartnerFinance.dc.html"] = page("partners", "وكيل القاهرة · الحساب المالي", "الشركاء · وكيل القاهرة", body, "", 900);
}

// 6. ملف الشريك — الإعدادات tab: every partner v2 knob, admin-controlled, with the network default beside it
{
  const ptabs = tabs([["الملف", ""], ["الأداء", ""], ["الطلبات", "142"], ["المخزون", ""], ["الحساب المالي", ""], ["الإعدادات", ""]], "الإعدادات");
  const knob = (label, value, unit, def, who, hint) => `<div class="row" style="padding:12px 0; border-top:1px solid ${T.stone100}; gap:16px; align-items:flex-start;">
    <div style="width:240px;"><div style="font-size:13px; font-weight:800;">${label}</div><div style="font-size:11px; color:${T.inkSoft}; line-height:1.6; margin-top:2px;">${hint}</div></div>
    <div class="row" style="gap:8px; width:190px;"><span class="input num" style="width:96px;">${value}</span><span style="font-size:12px; color:${T.inkSoft};">${unit}</span></div>
    <div style="font-size:12px; color:${T.inkSoft}; width:170px;">الافتراضي <span class="num" style="font-weight:700; color:${T.ink};">${def}</span></div>
    <div style="width:150px;">${who === "admin" ? pill("i", "يحدده المصنع") : pill("n", "يحدده الشريك")}</div>
  </div>`;
  const body = `
<div class="row" style="justify-content:space-between;">
  <div class="row" style="gap:12px;"><a class="link" href="#">${I.chevR(14)} الشركاء</a>${partnerCell("وكيل القاهرة", "جمال السيد عبدالعزيز · وكيل · القاهرة")}</div>
  <div class="row" style="gap:8px;"><span class="btn btn-s">استعادة الافتراضي</span><span class="btn btn-p">حفظ التغييرات</span></div>
</div>
<div class="card" style="overflow:hidden;"><div style="padding:8px 20px 0 20px;">${ptabs}</div>
  <div style="padding:6px 20px 20px 20px; display:flex; flex-direction:column; gap:22px;">
    <div><div class="row" style="padding:14px 0 4px 0; gap:8px;"><span class="well" style="width:30px; height:30px; border-radius:9px;">${I.clock(15)}</span><span style="font-size:14px; font-weight:800;">المهل</span><span style="font-size:12px; color:${T.inkSoft};">وعد للعميل — يحدده المصنع، ويراه الشريك في إعداداته للقراءة فقط</span></div>
      ${knob("مهلة التأكيد", "24", "ساعة", "24", "admin", "من إنشاء الطلب حتى تأكيد الشريك؛ بعدها يُعدّ متأخرًا")}
      ${knob("مهلة الشحن", "48", "ساعة", "48", "admin", "من التأكيد حتى التسليم للمندوب")}
    </div>
    <div><div class="row" style="padding:0 0 4px 0; gap:8px;"><span class="well" style="width:30px; height:30px; border-radius:9px;">${I.coins(15)}</span><span style="font-size:14px; font-weight:800;">المال</span></div>
      ${knob("نسبة الشراء من سعر البيع", "75", "%", "75", "admin", "تُطبَّق على الاستلامات القادمة فقط")}
    </div>
    <div><div class="row" style="padding:0 0 4px 0; gap:8px;"><span class="well" style="width:30px; height:30px; border-radius:9px;">${I.pkg(15)}</span><span style="font-size:14px; font-weight:800;">المخزون</span><span style="font-size:12px; color:${T.inkSoft};">تفضيلات الشريك — تؤثر على تنبيهاته فقط؛ تعرضها وتغيّر افتراضي الشبكة من الإعدادات</span></div>
      ${knob("حد المخزون المنخفض", "5", "قطعة", "5", "partner", "لكل صنف ما لم يضع الشريك حدًا لفئة أو منتج")}
      ${knob("راكد بعد", "60", "يومًا بلا بيع", "60", "partner", "")}
      ${knob("تغطية مستهدفة", "21", "يومًا", "21", "partner", "تُحرّك اقتراحات إعادة الطلب")}
    </div>
    <div><div class="row" style="padding:0 0 4px 0; gap:8px;"><span class="well" style="width:30px; height:30px; border-radius:9px;">${I.map(15)}</span><span style="font-size:14px; font-weight:800;">التشغيل</span><span style="font-size:12px; color:${T.inkSoft};">يديرها الشريك — تُعرض هنا ويمكن تجاوزها بملاحظة تُكتب في السجل</span></div>
      ${knob("الطاقة اليومية", "40", "طلبًا", "—", "partner", "")}
      <div class="row" style="padding:12px 0; border-top:1px solid ${T.stone100}; gap:16px;"><div style="width:240px; font-size:13px; font-weight:800;">أيام العمل</div><div class="row" style="gap:6px;">${["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"].map((d, i) => `<span class="chip${i < 6 ? " on" : ""}" style="height:28px;">${d}</span>`).join("")}</div><div style="margin-right:auto;">${pill("n", "يحدده الشريك")}</div></div>
      <div class="row" style="padding:12px 0; border-top:1px solid ${T.stone100}; gap:16px;"><div style="width:240px; font-size:13px; font-weight:800;">طريقة التسليم</div><div style="font-size:13px;">شركة شحن · مناطق الخدمة: القاهرة (12 منطقة)</div><div style="margin-right:auto;">${pill("n", "يحدده الشريك")}</div></div>
    </div>
  </div>
</div>`;
  files["PartnerSettings.dc.html"] = page("partners", "وكيل القاهرة · الإعدادات", "الشركاء · وكيل القاهرة · كل ما يحكم هذا الشريك في مكان واحد", body, "", 1060);
}

// 7. التوجيه — the governorate matrix (no priority tool; round-robin in creation order)
{
  const govs = [
    ["القاهرة", ["وكيل القاهرة", "موزع القليوبية"], ["61%", "39%"], "412", "s"],
    ["الجيزة", ["وكيل الجيزة"], ["100%"], "188", "s"],
    ["القليوبية", ["موزع القليوبية", "وكيل القاهرة"], ["72%", "28%"], "96", "s"],
    ["الإسكندرية", ["وكيل الإسكندرية"], ["100%"], "141", "s"],
    ["الدقهلية", ["موزع المنصورة"], ["100%"], "37", "w"],
    ["أسوان", [], [], "6", "d"],
    ["مطروح", [], [], "3", "d"],
    ["الوادي الجديد", [], [], "1", "d"],
  ];
  const body = `
<div class="card" style="overflow:hidden;">
  <div style="padding:8px 20px 0 20px;">${tabs([["الشركاء", "6"], ["طلبات الشراكة", "2"], ["التوجيه", ""], ["مخزون الشبكة", "14"]], "التوجيه")}</div>
  <div class="row" style="padding:14px 20px; gap:10px;">
    <span class="search" style="width:240px;">${I.search(16)} محافظة أو شريك</span>
    <span class="chip on">${I.alert(14)} بلا شريك فقط (3)</span>
    <span style="font-size:12px; color:${T.inkSoft}; margin-right:auto;">التوزيع بالتناوب بترتيب الإضافة · الطلب يذهب للشريك التالي في الدور · 30 يومًا</span>
  </div>
  <table>
    ${thead(["المحافظة", "الشركاء في الدور", "حصة آخر 30 يومًا", "طلبات · 30 يومًا", "الوضع", ""])}
    <tbody>${govs.map((g) => `<tr${g[4] === "d" ? ` style="background:${T.carn50}66;"` : ""}>
      <td style="font-weight:800;">${g[0]}</td>
      <td>${g[1].length ? `<span class="row" style="gap:6px; flex-wrap:wrap;">${g[1].map((p, i) => `<span class="chip" style="height:28px;">${p} <span style="color:${T.stone300};">${I.pause(12)}</span> <span style="color:${T.stone300};">${I.x(12)}</span></span>`).join("")}<span class="chip" style="height:28px; border-style:dashed; color:${T.inkSoft};">${I.plus(12)} إضافة</span></span>` : `<span class="row" style="gap:8px;">${pill("d", "لا شريك نشط")}<span class="btn btn-p btn-sm">${I.plus(12)} إضافة شريك</span></span>`}</td>
      <td>${g[2].length ? `<span class="row" style="gap:4px;">${g[2].map((s, i) => `<span class="meter" style="width:${parseInt(s)}px; background:${i ? T.stone200 : T.lapis800};"></span>`).join("")}<span class="num" style="font-size:12px; color:${T.inkSoft}; margin-right:6px;">${g[2].join(" · ")}</span></span>` : "—"}</td>
      <td class="num">${g[3]}</td>
      <td>${g[4] === "d" ? pill("d", "الطلبات تنتظر إسنادًا يدويًا") : g[4] === "w" ? pill("w", "شريك واحد فقط") : pill("s", "تلقائي")}</td>
      <td><span class="chip" style="height:28px;">تلقائي ${I.chevD(12)}</span></td>
    </tr>`).join("")}</tbody>
  </table>
</div>
${note(`الصفوف الحمراء تظهر أيضًا في طابور <b>اليوم</b> تحت «طلبات بلا شريك». الإيقاف المؤقت (⏸) يُبقي الشريك في القائمة خارج الدور — للإجازات. لا أداة أولوية الآن (قرار 13 سبتمبر).`)}`;
  files["Routing.dc.html"] = page("partners", "التوجيه", "الشركاء · أي شريك يخدم أي محافظة", body, "", 900);
}

// 8. مخزون الشبكة — every partner × low-stock SKUs, sortable by cover
{
  const rows = [
    ["3030-01-XXL-BLK", "تي شيرت رجالي نصف كم سادة", "XXL · أسود", "وكيل القاهرة", "0", "0", "3", "d"],
    ["8902-5-XXL-WHT", "طقم أطفال فانلة كت وشورت", "XXL · أبيض", "موزع القليوبية", "2", "4", "4", "d"],
    ["NK-9090-11-XXL", "برا حريمي مشجر أستك", "XXL", "وكيل الجيزة", "1", "2", "3", "d"],
    ["3030-01-M-BLK", "تي شيرت رجالي نصف كم سادة", "M · أسود", "وكيل القاهرة", "6", "12", "3", "w"],
    ["5540-2-L-NVY", "بيجامة قطن رجالي", "L · كحلي", "وكيل الإسكندرية", "9", "18", "3", "w"],
    ["7710-3-OS", "شراب قطن قصير (3 أزواج)", "موحد", "موزع المنصورة", "4", "9", "3", "w"],
  ];
  const body = `
<div class="card" style="overflow:hidden;">
  <div style="padding:8px 20px 0 20px;">${tabs([["الشركاء", "6"], ["طلبات الشراكة", "2"], ["التوجيه", ""], ["مخزون الشبكة", "14"]], "مخزون الشبكة")}</div>
  <div class="row" style="padding:14px 20px; gap:10px; flex-wrap:wrap;">
    <span class="search" style="width:260px;">${I.search(16)} SKU أو اسم المنتج</span>
    <span class="chip">الشريك ${I.chevD(14)}</span><span class="chip">الفئة ${I.chevD(14)}</span><span class="chip on">تحت الحد فقط</span><span class="chip">نافد فقط</span>
    <span style="margin-right:auto;" class="row"><span class="btn btn-s">${I.dl(16)} تصدير</span></span>
  </div>
  <table>
    ${thead(["SKU", "المنتج", "المقاس · اللون", "الشريك", "قابل للبيع", "تغطية", "الحد", "الحالة", ""])}
    <tbody>${rows.map((r) => `<tr><td class="num" style="font-size:12px; color:${T.inkSoft};">${r[0]}</td><td style="font-weight:700;">${r[1]}</td><td style="color:${T.inkSoft};">${r[2]}</td><td>${r[3]}</td><td class="num" style="font-weight:800; color:${r[7] === "d" ? T.carn600 : T.ink};">${r[4]}</td><td class="num">${r[5]} يوم</td><td class="num">${r[6]}</td><td>${r[7] === "d" ? pill("d", "نافد") : pill("w", "تحت الحد")}</td><td><span class="row" style="gap:6px;"><span class="btn btn-s btn-sm">تصحيح الكمية</span><span class="btn btn-s btn-sm">ملف الشريك</span></span></td></tr>`).join("")}</tbody>
  </table>
</div>
${note(`تصحيح الكمية من هنا يكتب قيد <b>MANUAL_ADJUSTMENT</b> في دفتر المخزون ويُمنع تحت المحجوز — نفس قواعد شاشة «مخزون الشركاء» القديمة، لكن الشبكة كلها في نظرة واحدة.`)}`;
  files["NetworkStock.dc.html"] = page("partners", "مخزون الشبكة", "الشركاء · كل شريك × كل صنف تحت الحد", body, "", 820);
}

// 9. المنتجات — the product page rebuilt around colours and sizes, gallery inline
{
  const sizes = [["3030-01-S-BLK", "S", "320", "—", "6 شركاء"], ["3030-01-M-BLK", "M", "320", "—", "6 شركاء"], ["3030-01-L-BLK", "L", "320", "360", "5 شركاء"], ["3030-01-XL-BLK", "XL", "340", "—", "4 شركاء"], ["3030-01-XXL-BLK", "XXL", "360", "—", "نافد عند 2"]];
  const thumb = (i, main) => `<div style="width:${main ? 148 : 68}px; height:${main ? 148 : 68}px; border-radius:12px; background:linear-gradient(135deg, ${T.stone100}, ${T.stone200}); border:${main ? `2px solid ${T.gold500}` : `1px solid ${T.stone200}`}; position:relative; display:flex; align-items:center; justify-content:center; color:${T.stone300};">${I.image(main ? 26 : 18)}${main ? `<span class="pill pill-w" style="position:absolute; bottom:6px; right:6px;">الرئيسية</span>` : `<span style="position:absolute; top:4px; left:4px; color:${T.inkSoft};">${I.grip(12)}</span>`}</div>`;
  const body = `
<div class="row" style="justify-content:space-between;">
  <div class="row" style="gap:12px;"><a class="link" href="#">${I.chevR(14)} المنتجات</a><span style="font-size:16px; font-weight:800;">تي شيرت رجالي نصف كم سادة</span><span class="num" style="font-size:12px; color:${T.inkSoft};">3030-01</span>${pill("s", "نشط")}</div>
  <div class="row" style="gap:8px;"><span class="btn btn-s">${I.eye(16)} عرض في المتجر</span><span class="btn btn-p">حفظ</span></div>
</div>
<div style="display:grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap:16px; align-items:start;">
  <div style="display:flex; flex-direction:column; gap:16px;">
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:14px;">
      <div class="row" style="justify-content:space-between;"><h2 class="card-t">الألوان (3)</h2><span class="btn btn-s btn-sm">${I.plus(14)} لون جديد</span></div>
      <div class="row" style="gap:8px;">${[["أسود", "#111", true], ["أبيض", "#f4f1ea", false], ["كحلي", "#1d2a4d", false]].map(([n, c, on]) => `<span class="chip${on ? " on" : ""}"><i style="width:12px; height:12px; border-radius:999px; background:${c}; border:1px solid ${T.stone300}; display:inline-block;"></i>${n}</span>`).join("")}</div>
      <div style="border-top:1px solid ${T.stone100}; padding-top:14px; display:grid; grid-template-columns: 200px minmax(0, 1fr); gap:16px;">
        <div class="field"><label>اسم اللون</label><span class="input">أسود</span><label style="margin-top:6px;">الكود</label><span class="input num">#111111</span><label style="margin-top:6px;">مرئي في المتجر</label><span class="toggle"><b></b></span></div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div class="row" style="justify-content:space-between;"><span style="font-size:13px; font-weight:800;">معرض هذا اللون · 5 صور</span><span class="row" style="gap:6px;"><span class="btn btn-s btn-sm">${I.ul(14)} رفع</span><span class="btn btn-s btn-sm">${I.image(14)} من المكتبة</span></span></div>
          <div class="row" style="gap:10px; align-items:flex-start;">${thumb(0, true)}<div style="display:flex; flex-wrap:wrap; gap:8px; width:240px;">${[1, 2, 3, 4].map((i) => thumb(i, false)).join("")}<div style="width:68px; height:68px; border-radius:12px; border:1.5px dashed ${T.stone300}; display:flex; align-items:center; justify-content:center; color:${T.inkSoft};">${I.plus(16)}</div></div></div>
          <div style="font-size:11px; color:${T.inkSoft};">اسحب لإعادة الترتيب · الصورة الرئيسية تظهر في البطاقات والسلة · المعرض كله في صفحة المنتج</div>
        </div>
      </div>
    </div>
    <div class="card" style="overflow:hidden;">
      <div class="card-h" style="padding-bottom:10px;"><div><h2 class="card-t">مقاسات لون «أسود» (5)</h2><p class="card-s">المخزون عند الشركاء لا هنا — الرقم للاطلاع فقط</p></div><span class="row" style="gap:6px;"><span class="btn btn-s btn-sm">${I.plus(14)} إضافة المقاسات القياسية</span><span class="btn btn-s btn-sm">${I.plus(14)} مقاس</span></span></div>
      <table>${thead(["SKU", "المقاس", "السعر", "قبل الخصم", "متوفر عند", "نشط", ""])}<tbody>${sizes.map((r) => `<tr><td class="num" style="font-size:12px; color:${T.inkSoft};">${r[0]}</td><td style="font-weight:800;">${r[1]}</td><td><span class="input num" style="width:84px; height:32px;">${r[2]}</span></td><td><span class="input num" style="width:84px; height:32px; color:${T.inkSoft};">${r[3]}</span></td><td style="font-size:12px; color:${r[4].includes("نافد") ? T.carn600 : T.inkSoft};">${r[4]}</td><td><span class="toggle" style="transform:scale(.85);"><b></b></span></td><td><span style="color:${T.stone300};">${I.x(14)}</span></td></tr>`).join("")}</tbody></table>
    </div>
  </div>
  <div style="display:flex; flex-direction:column; gap:16px;">
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:10px;">
      <h2 class="card-t">بيانات المنتج</h2>
      <div class="field"><label>الاسم</label><span class="input">تي شيرت رجالي نصف كم سادة</span></div>
      <div class="field"><label>الفئة</label><span class="input">رجالي › تي شيرت ${I.chevD(14)}</span></div>
      <div class="field"><label>الرابط</label><span class="input num">mens-plain-tshirt</span></div>
      <div class="row" style="gap:8px;"><div class="field" style="flex:1;"><label>الوزن (جم)</label><span class="input num">180</span></div><div class="field" style="flex:1;"><label>الترتيب</label><span class="input num">12</span></div></div>
      <div class="field"><label>الوسوم</label><span class="row" style="gap:6px; flex-wrap:wrap;"><span class="chip" style="height:26px;">قطن</span><span class="chip" style="height:26px;">صيفي</span><span class="chip" style="height:26px;">سادة</span></span></div>
      <div class="field"><label>الوصف</label><span class="input" style="height:auto; min-height:70px; align-items:flex-start; padding:10px 12px; color:${T.inkSoft};">قطن مصري طويل التيلة 100%…</span></div>
    </div>
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:10px;">
      <h2 class="card-t">صورة المنتج الرئيسية</h2>
      <div class="row" style="gap:10px;">${thumb(0, false)}<div style="font-size:12px; color:${T.inkSoft}; line-height:1.6;">تُستخدم في القوائم إن لم يُختر لون. <a class="link" href="#">تغيير من المكتبة</a></div></div>
    </div>
    ${note(`آخر تغيير: أنت · أمس 14:20 · «السعر L: 320 → 360». <a class="link" href="#">السجل الكامل لهذا المنتج</a>`, T.ground)}
  </div>
</div>`;
  files["Product.dc.html"] = page("products", "المنتج", "الكتالوج · المنتجات · 3030-01", body, "", 1060);
}

// 10. الصور — the media library
{
  const tile = (i, usage, tone) => `<div class="card" style="overflow:hidden; display:flex; flex-direction:column;">
    <div style="height:150px; background:linear-gradient(${120 + i * 17}deg, ${T.stone100}, ${T.stone200}); display:flex; align-items:center; justify-content:center; color:${T.stone300}; position:relative;">${I.image(28)}<span style="position:absolute; top:8px; right:8px;">${chk(false)}</span></div>
    <div style="padding:10px 12px; display:flex; flex-direction:column; gap:4px;"><div class="num" style="font-size:11px; color:${T.inkSoft}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">nile-kings/products/tshirt-blk-0${i}.jpg</div><div style="font-size:12px;">${usage}</div><div class="row" style="justify-content:space-between;"><span class="num" style="font-size:11px; color:${T.inkSoft};">1600×2000 · 412 KB</span>${pill(tone, tone === "s" ? "مستخدمة" : tone === "n" ? "غير مستخدمة" : "مفقودة")}</div></div>
  </div>`;
  const body = `
<div class="card" style="overflow:hidden;">
  <div class="row" style="padding:14px 20px; gap:10px; flex-wrap:wrap;">
    <span class="search" style="width:260px;">${I.search(16)} اسم الملف أو المنتج</span>
    <span class="chip">المنتج ${I.chevD(14)}</span><span class="chip">اللون ${I.chevD(14)}</span><span class="chip on">غير مستخدمة (23)</span><span class="chip">مفقودة (2)</span><span class="chip">${I.cal(14)} تاريخ الرفع ${I.chevD(14)}</span>
    <span style="margin-right:auto;" class="row" style="gap:8px;"><span class="btn btn-s">${I.refresh(16)} مزامنة مع Cloudinary</span><span class="btn btn-p">${I.ul(16)} رفع صور</span></span>
  </div>
  <div class="row" style="margin:0 20px 12px 20px; padding:10px 16px; border-radius:12px; background:${T.lapis50}; gap:12px;">
    <span style="font-size:13px; font-weight:800; color:${T.lapis800};">4 صور محددة</span>
    <span class="btn btn-p btn-sm">إسناد إلى منتج ولون ${I.chevD(14)}</span><span class="btn btn-s btn-sm">تعيين كصورة رئيسية</span><span class="btn btn-s btn-sm" style="color:${T.carn600};">حذف (غير المستخدمة فقط)</span>
    <a class="link" href="#" style="margin-right:auto;">إلغاء التحديد</a>
  </div>
  <div style="padding:0 20px 20px 20px; display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:14px;">
    ${tile(1, "تي شيرت رجالي · أسود · رئيسية", "s")}${tile(2, "تي شيرت رجالي · أسود · معرض 2", "s")}${tile(3, "غير مسندة", "n")}${tile(4, "غير مسندة", "n")}${tile(5, "طقم أطفال · أبيض · معرض 1", "s")}
    ${tile(6, "غير مسندة", "n")}${tile(7, "بيجامة قطن · كحلي · رئيسية", "s")}${tile(8, "مسجّلة والملف غير موجود", "d")}${tile(9, "غير مسندة", "n")}${tile(10, "برا حريمي · مشجر · معرض 3", "s")}
  </div>
  <div class="row" style="justify-content:space-between; padding:0 20px 16px 20px;"><span style="font-size:12px; color:${T.inkSoft};">عرض 1–10 من 214 · آخر مزامنة أمس 23:00 · 3 صور في Cloudinary لم تكن مسجّلة أُضيفت كغير مستخدمة</span></div>
</div>
${note(`<b>القاعدة:</b> كل رفع من الموقع يُسجَّل هنا بمعرّفه في Cloudinary. الحذف مرفوض للصورة المستخدمة؛ حذف غير المستخدمة يحذفها من Cloudinary أيضًا ويُكتب في السجل. «مزامنة» تقرأ المجلد وتُصالح: ما في Cloudinary وليس هنا يُستورد كغير مستخدم، وما هنا وليس هناك يُعلَّم مفقودًا.`)}`;
  files["Media.dc.html"] = page("media", "الصور", "الكتالوج · مكتبة الصور · 214 صورة · 23 غير مستخدمة", body, "", 900);
}

// 11. التقارير — network sales with partner as a first-class breakdown
{
  const rows = [["وكيل القاهرة", "412", "131,900", "+8%", "3%"], ["وكيل الجيزة", "188", "60,200", "+14%", "1%"], ["وكيل الإسكندرية", "141", "45,100", "−2%", "0%"], ["موزع القليوبية", "96", "30,700", "+5%", "5%"], ["موزع المنصورة", "37", "11,800", "جديد", "17%"]];
  const body = `
<div class="row" style="gap:6px;">${["المبيعات", "التجهيز", "المخزون", "المال"].map((t, i) => `<span class="chip${i === 0 ? " on" : ""}">${t}</span>`).join("")}<span style="margin-right:auto;" class="row" style="gap:6px;">${["اليوم", "7 أيام", "30 يومًا", "هذا الشهر", "الشهر الماضي", "مخصص"].map((t, i) => `<span class="chip${i === 2 ? " on" : ""}">${t}</span>`).join("")}</span></div>
<div style="font-size:12px; color:${T.inkSoft};">14 أغسطس – 13 سبتمبر · مقارنةً بـ 15 يوليو – 13 أغسطس · الشبكة كلها</div>
<div style="display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:16px;">
  ${kpi("الإيراد", "279,700", "طلبات تم تسليمها فقط", up("+7%"), I.coins, "ج.م")}
  ${kpi("الطلبات", "874", "كل الحالات", up("+9%"), I.cart)}
  ${kpi("القطع", "2,410", "طلبات تم تسليمها فقط", up("+6%"), I.pkg)}
  ${kpi("متوسط الطلب", "320", "طلبات تم تسليمها فقط", down("−2%"), I.tag, "ج.م")}
  ${kpi("نسبة الإلغاء", "6.8%", "من كل الطلبات", up("−1.3 نقطة"), I.x)}
</div>
<div class="card"><div class="card-h"><div><h2 class="card-t">الإيراد اليومي</h2><p class="card-s">الفترة الحالية مقابل السابقة</p></div></div><div style="padding:8px 12px 12px 12px;">${lineChart(1080, 200, rev30, ["14 أغسطس", "21 أغسطس", "28 أغسطس", "5 سبتمبر", "13 سبتمبر"])}</div></div>
<div class="card" style="overflow:hidden;">
  <div style="padding:8px 20px 0 20px;">${tabs([["حسب الشريك", ""], ["حسب المحافظة", ""], ["حسب الفئة", ""], ["حسب المنتج", ""], ["حسب طريقة الدفع", ""], ["حسب اليوم", ""]], "حسب الشريك")}</div>
  <table>${thead(["الشريك", "الطلبات", "الإيراد", "مقارنة بالفترة السابقة", "نسبة الإلغاء", ""])}<tbody>${rows.map((r) => `<tr><td style="font-weight:700;">${r[0]}</td><td class="num">${r[1]}</td><td class="num" style="font-weight:800;">${r[2]}</td><td>${r[3] === "جديد" ? up("جديد") : r[3].startsWith("−") ? down(r[3]) : up(r[3])}</td><td class="num">${r[4]}</td><td><a class="link" href="#">أداء الشريك ${I.chevL(12)}</a></td></tr>`).join("")}</tbody></table>
  <div class="row" style="justify-content:space-between; padding:12px 20px;"><span style="font-size:12px; color:${T.inkSoft};">5 شركاء</span><span class="btn btn-s btn-sm">${I.dl(14)} CSV كامل</span></div>
</div>`;
  files["ReportSales.dc.html"] = page("reports", "التقارير · المبيعات", "الشبكة كلها · نفس منصة تقارير الشركاء", body, "", 1120);
}

// 12. السجل — the audit log
{
  const rows = [
    ["قبل 4 دقائق", "جمال السيد", "شريك · وكيل القاهرة", "تغيير حالة", "الطلب #NK-10482", "مؤكد → قيد التجهيز"],
    ["قبل 25 دقيقة", "عمر عبد العزيز", "مسؤول", "إعداد شريك", "موزع القليوبية", "نسبة الشراء: 75% → 70%"],
    ["قبل ساعة", "عمر عبد العزيز", "مسؤول", "إسناد", "الطلب #NK-10479", "بلا شريك → وكيل الجيزة · نقل الحجز"],
    ["قبل ساعتين", "سلمى فهمي", "شريك · موزع القليوبية", "استلام", "إيصال #R-2041", "120 قطعة · 31,200 ج.م بنسبة 75%"],
    ["قبل 3 ساعات", "عمر عبد العزيز", "مسؤول", "تصحيح مخزون", "3030-01-XXL-BLK · وكيل القاهرة", "قابل للبيع: 4 → 0 · «جرد فعلي»"],
    ["أمس 14:20", "عمر عبد العزيز", "مسؤول", "سعر", "3030-01-L-BLK", "320 → 360 ج.م"],
    ["أمس 11:05", "عمر عبد العزيز", "مسؤول", "إعداد المتجر", "رسوم الدفع عند الاستلام", "2% → 2.5% · أُكِّد"],
    ["أمس 09:40", "عمر عبد العزيز", "مسؤول", "دفعة", "وكيل القاهرة", "قسط 12,000 ج.م · InstaPay 88213"],
    ["12 سبتمبر", "عمر عبد العزيز", "مسؤول", "صلاحيات", "محمد رضا", "مسؤول → عميل"],
  ];
  const body = `
<div class="card" style="overflow:hidden;">
  <div class="row" style="padding:14px 20px; gap:10px; flex-wrap:wrap;">
    <span class="search" style="width:280px;">${I.search(16)} رقم طلب أو شريك أو SKU أو اسم</span>
    <span class="chip">الفاعل ${I.chevD(14)}</span><span class="chip">النوع ${I.chevD(14)}</span><span class="chip">الإجراء ${I.chevD(14)}</span><span class="chip">${I.cal(14)} آخر 7 أيام ${I.chevD(14)}</span>
    <span style="margin-right:auto;" class="row"><span class="btn btn-s">${I.dl(16)} CSV للفترة</span></span>
  </div>
  <table>${thead(["متى", "من", "الصفة", "الإجراء", "على", "التغيير", ""])}<tbody>${rows.map((r) => `<tr><td style="font-size:12px; color:${T.inkSoft}; white-space:nowrap;">${r[0]}</td><td style="font-weight:700;">${r[1]}</td><td>${r[2].startsWith("مسؤول") ? pill("i", "مسؤول") : pill("n", r[2])}</td><td>${r[3]}</td><td style="font-weight:700; color:${T.lapis800};">${r[4]}</td><td class="num" style="font-size:12px;">${r[5]}</td><td><span style="color:${T.stone300};">${I.chevD(14)}</span></td></tr>`).join("")}</tbody></table>
  <div class="row" style="justify-content:space-between; padding:12px 20px;"><span style="font-size:12px; color:${T.inkSoft};">عرض 1–9 من 3,120 · يُحتفظ بالمال والمخزون للأبد، والباقي 400 يومًا</span></div>
</div>
${note(`الصف يُفتح ليعرض «قبل / بعد» كاملين وسبب التغيير إن وُجد. نفس السجل يظهر في سياقه: أسفل الطلب، وفي ملف الشريك، وفي صفحة المنتج، وفي الإعدادات.`)}`;
  files["Audit.dc.html"] = page("audit", "السجل", "من فعل ماذا ومتى · كل تغيير في المال أو المخزون أو الحالة أو الكتالوج أو الإعدادات", body, "", 820);
}

// 13. الإعدادات — grouped, confirm on price-affecting, history inline
{
  const group = (icon, title, sub, body) => `<div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:12px;"><div class="row" style="gap:10px;"><span class="well">${icon(18)}</span><div><h2 class="card-t">${title}</h2><p class="card-s">${sub}</p></div><span class="btn btn-p btn-sm" style="margin-right:auto;">حفظ</span></div>${body}</div>`;
  const f = (label, value, unit = "", w = 120, hist = "") => `<div class="field"><label>${label}</label><span class="row" style="gap:8px;"><span class="input num" style="width:${w}px;">${value}</span>${unit ? `<span style="font-size:12px; color:${T.inkSoft};">${unit}</span>` : ""}</span>${hist ? `<span style="font-size:11px; color:${T.inkSoft};">${hist}</span>` : ""}</div>`;
  const body = `
<div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:16px; align-items:start;">
  ${group(I.store, "المتجر", "يغيّر ما يراه العميل — يُطلب تأكيد قبل الحفظ", `
    <div class="row" style="gap:16px; align-items:flex-start;">${f("رسوم الدفع عند الاستلام", "2.5", "% من (المنتجات + التوصيل − الخصم)", 90, "السابق 2% · أمس 11:05 · أنت")}</div>
    <div class="row" style="justify-content:space-between; padding:10px 0; border-top:1px solid ${T.stone100};"><div><div style="font-size:13px; font-weight:800;">خصم كبار السن</div><div style="font-size:11px; color:${T.inkSoft};">مفعّل في المتجر · كان مبنيًا ولا يظهر في أي شاشة</div></div><span class="toggle"><b></b></span></div>
    <div class="row" style="justify-content:space-between; padding:10px 0; border-top:1px solid ${T.stone100};"><div><div style="font-size:13px; font-weight:800;">أسعار الشحن</div><div style="font-size:11px; color:${T.inkSoft};">مصر للبريد · 6 مناطق × شرائح وزن · تُقرأ من هنا بعد مهمة الشحن (المرحلة 5)</div></div><a class="link" href="#">تعديل الجدول ${I.chevL(12)}</a></div>`)}
  ${group(I.users, "الشركاء · افتراضيات الشبكة", "يرثها كل شريك جديد؛ لا تغيّر شريكًا قائمًا إلا من ملفه", `
    <div class="row" style="gap:16px; flex-wrap:wrap;">${f("نسبة الشراء", "75", "%", 80)}${f("مهلة التأكيد", "24", "ساعة", 80)}${f("مهلة الشحن", "48", "ساعة", 80)}</div>
    <div class="row" style="gap:16px; flex-wrap:wrap;">${f("حد المخزون المنخفض", "5", "قطعة", 80)}${f("راكد بعد", "60", "يومًا", 80)}${f("تغطية مستهدفة", "21", "يومًا", 80)}</div>`)}
  ${group(I.shield, "الأمان", "قواعد رمز التحقق — حدود دنيا وعليا مفروضة", `
    <div class="row" style="gap:16px; flex-wrap:wrap;">${f("صلاحية الرمز", "5", "دقائق", 80)}${f("الانتظار بين الإرسالين", "60", "ثانية", 80)}${f("محاولات التحقق", "5", "", 80)}${f("مدة القفل", "15", "دقيقة", 80)}</div>`)}
  ${group(I.bell, "الإشعارات", "ما يصلك أنت — لا علاقة له بتنبيهات الشركاء", `
    ${[["طلب بلا شريك لأكثر من ساعة", true], ["طلب تجاوز مهلة الشريك", true], ["سؤال عميل جديد", true], ["طلب شراكة جديد", true], ["قسط شريك استحق", true], ["صنف نافد عند شريك", false]].map(([l, on]) => `<div class="row" style="justify-content:space-between; padding:8px 0; border-top:1px solid ${T.stone100};"><span style="font-size:13px;">${l}</span><span class="toggle${on ? "" : " off"}"><b></b></span></div>`).join("")}`)}
</div>`;
  files["Settings.dc.html"] = page("settings", "الإعدادات", "أربع مجموعات · حفظ لكل مجموعة · كل تغيير في السجل بقيمته السابقة", body, "", 980);
}

// canvas layout
const canvas = {
  artboards: [
    { file: "Main.dc.html", title: "اليوم", x: 0, y: 0, w: 1440, h: 1180 },
    { file: "Orders.dc.html", title: "الطلبات · الشبكة", x: 1540, y: 0, w: 1440, h: 900 },
    { file: "OrderDetail.dc.html", title: "تفاصيل الطلب · صلاحيات المصنع", x: 3080, y: 0, w: 1440, h: 1000 },
    { file: "Partners.dc.html", title: "الشركاء · القائمة", x: 0, y: 1340, w: 1440, h: 900 },
    { file: "PartnerFinance.dc.html", title: "ملف الشريك · الحساب المالي", x: 1540, y: 1340, w: 1440, h: 900 },
    { file: "PartnerSettings.dc.html", title: "ملف الشريك · الإعدادات", x: 3080, y: 1340, w: 1440, h: 1060 },
    { file: "Routing.dc.html", title: "التوجيه · مصفوفة المحافظات", x: 0, y: 2560, w: 1440, h: 900 },
    { file: "NetworkStock.dc.html", title: "مخزون الشبكة", x: 1540, y: 2560, w: 1440, h: 820 },
    { file: "ReportSales.dc.html", title: "التقارير · المبيعات", x: 3080, y: 2560, w: 1440, h: 1120 },
    { file: "Product.dc.html", title: "المنتج · ألوان ومقاسات ومعرض", x: 0, y: 3840, w: 1440, h: 1060 },
    { file: "Media.dc.html", title: "الصور · المكتبة", x: 1540, y: 3840, w: 1440, h: 900 },
    { file: "Audit.dc.html", title: "السجل", x: 3080, y: 3840, w: 1440, h: 820 },
    { file: "Settings.dc.html", title: "الإعدادات", x: 0, y: 5060, w: 1440, h: 980 },
  ],
  annotations: [
    { id: "brief", x: 0, y: -190, w: 640, text: "لوحة الإدارة v2 — مكتب عمليات المصنع. نفس لغة بوابة الشركاء v2 (شريط أبيض، أرضية stone-50، ذهبي للتمييز). 9 عناصر في القائمة بدل 14: اليوم (طابور ما يحتاجك) · الطلبات (الشبكة كلها، الشريك عمود) · أسئلة العملاء · الشركاء (القائمة، طلبات الشراكة، التوجيه، مخزون الشبكة، وملف لكل شريك) · الكتالوج (المنتجات، الصور، الفئات، الكوبونات) · العملاء (+ المسؤولون) · التقارير · السجل · الإعدادات. المصنع يملك الكتالوج والصور؛ الشريك يملك كمياته فقط." },
    { id: "removed", x: 700, y: -190, w: 420, text: "ما اختفى: زر التقارير في اللوحة، شاشة الطلبات الموجهة (قدراتها داخل تفاصيل الطلب)، قواعد التوجيه كشاشات (مصفوفة واحدة)، مخزون الشركاء كشاشة، المسؤولون كشاشة، تحليلات v1. لا أداة أولوية الآن." },
  ],
  launch: { view: "canvas" },
};

for (const [name, src] of Object.entries(files)) fs.writeFileSync(path.join(out, name), src, "utf8");
fs.writeFileSync(path.join(out, "canvas.json"), JSON.stringify(canvas, null, 2), "utf8");
console.log("wrote", Object.keys(files).length, "artboards + canvas.json to", out);
