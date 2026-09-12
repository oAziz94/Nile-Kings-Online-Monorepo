// Generates the partner-v2 artboards (.dc.html) from one shared shell + page bodies.
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

const rev30 = [1210, 1380, 1120, 1540, 1720, 1660, 1490, 1830, 1910, 1750, 1620, 1980, 2140, 2010, 1870, 2260, 2390, 2180, 2050, 2420, 2610, 2480, 2330, 2570, 2750, 2690, 2540, 2810, 2960, 2870];

// ---- shell ----
const NAV = [
  { sec: "الرئيسية", items: [["اليوم", I.home, "today"], ["الطلبات", I.truck, "orders"]] },
  { sec: "المخزون", items: [["المخزون", I.box, "stock"]] },
  { sec: "الشبكة", items: [["الموزعون", I.users, "network"]] },
  { sec: "التقارير", items: [["التقارير", I.chart, "reports"]] },
  { sec: "الحساب", items: [["الإعدادات", I.cog, "settings"], ["المتجر", I.store, "store"], ["تسجيل الخروج", I.out, "logout"]] },
];
function sidebar(active) {
  return `<aside style="width:248px; flex:none; background:#fff; border-left:1px solid ${T.stone200}; padding:20px 14px; display:flex; flex-direction:column; gap:6px; min-height:100%;">
  <div class="row" style="gap:10px; padding:0 6px 14px 6px;">
    <img src="logo-lapis-mark.png" alt="" style="width:34px; height:34px; object-fit:contain;">
    <div><div style="font-size:14px; font-weight:800; line-height:1.1;">قطن ملوك النيل</div><div style="font-size:11px; color:${T.inkSoft};">بوابة الشركاء</div></div>
  </div>
  <div class="card" style="box-shadow:none; background:${T.ground}; border-radius:12px; padding:10px 12px; display:flex; align-items:center; gap:10px;">
    <div style="width:36px; height:36px; border-radius:999px; background:${T.lapis800}; color:${T.gold500}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px;">ج</div>
    <div style="min-width:0;"><div style="font-size:13px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">جمال السيد عبدالعزيز</div><div style="font-size:11px; color:${T.inkSoft};">وكيل · القاهرة</div></div>
    <span style="margin-right:auto; color:${T.inkSoft};">${I.chevD(14)}</span>
  </div>
  <nav class="nav" style="display:flex; flex-direction:column; gap:2px;">
    ${NAV.map((g) => `<div class="sec">${g.sec}</div>` + g.items.map(([l, icon, k]) => `<div class="item${k === active ? " active" : ""}">${icon(17)}<span>${l}</span></div>`).join("")).join("")}
  </nav>
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

// ---- pages ----
const files = {};

// 1. Main — اليوم
{
  const queueGroup = (title, count, tone, rows, more) => `
<div style="display:flex; flex-direction:column;">
  <div class="row" style="justify-content:space-between; padding:14px 20px 8px 20px;">
    <div class="row" style="gap:8px;"><span style="font-size:14px; font-weight:800;">${title}</span>${pill(tone, count)}</div>
    <a class="link" href="#">عرض الكل ${I.chevL(12)}</a>
  </div>
  ${rows.map((r) => `<div class="row" style="padding:10px 20px; border-top:1px solid ${T.stone100}; gap:14px;">
    <span class="num" style="font-size:12px; font-weight:700; color:${T.inkSoft}; width:84px;">${r[0]}</span>
    <span style="font-size:13px; font-weight:700; width:170px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r[1]}</span>
    <span style="font-size:12px; color:${T.inkSoft}; width:150px;">${r[2]}</span>
    <span class="num" style="font-size:13px; font-weight:700; width:90px;">${r[3]}</span>
    <span style="font-size:12px; color:${T.inkSoft}; flex:1;">${r[4]}</span>
    <span class="btn ${r[6] || "btn-s"} btn-sm">${r[5]}</span>
  </div>`).join("")}
  ${more ? `<div style="padding:8px 20px 12px; font-size:12px; color:${T.inkSoft};">و ${more} أخرى</div>` : ""}
</div>`;

  const body = `
<div style="display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:16px;">
  ${kpi("طلبات اليوم", "18", "أمس 15", up("+3"), I.cart)}
  ${kpi("إيراد هذا الأسبوع", "42,350", "الأسبوع الماضي 37,800", up("+12%"), I.coins, "ج.م")}
  ${kpi("وحدات قابلة للبيع", "1,284", "12 صنفًا تحت الحد", flat("—"), I.pkg)}
  ${kpi("طلبات متأخرة", "4", "تجاوزت 24 ساعة", down("+2"), I.clock)}
</div>
<div style="display:grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap:16px;">
  <div class="card">
    <div class="card-h">
      <div><h2 class="card-t">الإيراد آخر 30 يومًا</h2><p class="card-s">مقارنة بالفترة السابقة <span class="delta delta-up"><span class="num">+9%</span></span></p></div>
      <div class="row" style="gap:6px;"><span class="chip on">الإيراد</span><span class="chip">الطلبات</span></div>
    </div>
    <div style="padding:8px 12px 12px 12px;">${lineChart(760, 220, rev30, ["15 أغسطس", "22 أغسطس", "29 أغسطس", "5 سبتمبر", "13 سبتمبر"])}</div>
  </div>
  <div style="display:flex; flex-direction:column; gap:16px;">
    <div class="card" style="padding:18px 20px; display:flex; align-items:center; gap:14px;">
      <div style="width:56px; height:56px; border-radius:999px; border:2px solid ${T.stone200}; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:800;" class="num">13</div>
      <div style="flex:1;"><div style="font-size:14px; font-weight:800;">السبت</div><div style="font-size:12px; color:${T.inkSoft};">سبتمبر 2026 · يوم عمل</div></div>
      <span class="btn btn-p btn-sm">${I.plus(14)} استلام من المصنع</span>
    </div>
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:12px;">
      <div class="row" style="justify-content:space-between;"><span style="font-size:13px; font-weight:800;">طاقة اليوم</span><span class="num" style="font-size:12px; color:${T.inkSoft};">14 / 40 طلبًا</span></div>
      <div class="meter"><i style="width:35%;"></i></div>
      <div style="font-size:12px; color:${T.inkSoft};">تستطيع استقبال 26 طلبًا آخر اليوم قبل بلوغ طاقتك.</div>
    </div>
  </div>
</div>
<div class="card">
  <div class="card-h" style="padding-bottom:6px;"><div><h2 class="card-t">ما يحتاج قرارك الآن</h2><p class="card-s">كل صف له إجراء واحد واضح — نفّذه من هنا.</p></div><span class="chip">${I.filter(14)} كل الأنواع</span></div>
  ${queueGroup("بانتظار التأكيد", "5", "i", [
    ["#NK-10482", "منى عبد الرحمن", "مدينة نصر · القاهرة", "640 ج.م", "منذ 25 دقيقة", "تأكيد", "btn-p"],
    ["#NK-10481", "أحمد سامي", "المعادي · القاهرة", "1,120 ج.م", "منذ 40 دقيقة", "تأكيد", "btn-p"],
    ["#NK-10479", "سارة خالد", "مصر الجديدة · القاهرة", "380 ج.م", "منذ ساعة", "تأكيد", "btn-p"],
  ], 2)}
  ${queueGroup("متأخرة عن المهلة", "4", "d", [
    ["#NK-10431", "هاني مصطفى", "الشروق · القاهرة", "760 ج.م", "مؤكد منذ 31 ساعة", "بدء التجهيز"],
    ["#NK-10427", "دينا فؤاد", "العبور · القليوبية", "520 ج.م", "قيد التجهيز منذ 52 ساعة", "جاهز للتسليم"],
  ], 2)}
  ${queueGroup("جاهزة للتسليم", "3", "w", [
    ["#NK-10460", "محمود عادل", "المقطم · القاهرة", "910 ج.م", "جاهز منذ 3 ساعات", "تم التسليم للمندوب"],
  ], 2)}
  ${queueGroup("مخزون تحت الحد", "12", "w", [
    ["3030-01", "تي شيرت رجالي نصف كم سادة", "XXL · أسود", "0 قابل للبيع", "الحد 5 · يبيع 3/أسبوع", "+ كمية"],
    ["8902-5", "طقم أطفال فانلة كت وشورت", "XXL · أبيض", "2 قابل للبيع", "الحد 5 · يبيع 4/أسبوع", "+ كمية"],
  ], 10)}
</div>`;
  files["Main.dc.html"] = page("today", "اليوم", "السبت 13 سبتمبر 2026 · جمال السيد عبدالعزيز", body, `<span class="search" style="width:260px;">${I.search(16)} ابحث برقم الطلب أو الهاتف</span>`, 1240);
}

// 2. Orders — pipeline
{
  const rows = [
    ["#NK-10482", "منى عبد الرحمن", "مدينة نصر · القاهرة", "3", "640", "الدفع عند الاستلام", "CREATED", "25 دقيقة", "تأكيد", "btn-p"],
    ["#NK-10481", "أحمد سامي", "المعادي · القاهرة", "5", "1,120", "إنستاباي", "CREATED", "40 دقيقة", "تأكيد", "btn-p"],
    ["#NK-10479", "سارة خالد", "مصر الجديدة · القاهرة", "1", "380", "الدفع عند الاستلام", "CREATED", "ساعة", "تأكيد", "btn-p"],
    ["#NK-10476", "كريم ناجي", "التجمع الخامس · القاهرة", "2", "560", "الدفع عند الاستلام", "CONFIRMED", "3 ساعات", "بدء التجهيز", "btn-s"],
    ["#NK-10471", "نهى إبراهيم", "حلوان · القاهرة", "4", "890", "إنستاباي", "PROCESSING", "6 ساعات", "جاهز للتسليم", "btn-s"],
    ["#NK-10460", "محمود عادل", "المقطم · القاهرة", "2", "910", "الدفع عند الاستلام", "READY", "9 ساعات", "تم التسليم للمندوب", "btn-s"],
    ["#NK-10431", "هاني مصطفى", "الشروق · القاهرة", "3", "760", "الدفع عند الاستلام", "CONFIRMED", "31 ساعة", "بدء التجهيز", "btn-s"],
    ["#NK-10412", "ريم حسن", "الزمالك · القاهرة", "1", "240", "إنستاباي", "SHIPPED", "يومان", "تم التسليم", "btn-s"],
  ];
  const body = `
<div class="card" style="overflow:hidden;">
  <div style="padding:8px 20px 0 20px;">
    <div class="tabs">
      <span class="tab">الكل <span class="cnt">321</span></span>
      <span class="tab on">بانتظار التأكيد <span class="cnt">5</span></span>
      <span class="tab">مؤكد <span class="cnt">291</span></span>
      <span class="tab">قيد التجهيز <span class="cnt">14</span></span>
      <span class="tab">جاهز للتسليم <span class="cnt">12</span></span>
      <span class="tab">تم الشحن <span class="cnt">38</span></span>
      <span class="tab">تم التسليم <span class="cnt">1,012</span></span>
      <span class="tab">ملغي <span class="cnt">121</span></span>
    </div>
  </div>
  <div class="row" style="padding:14px 20px; gap:10px; flex-wrap:wrap;">
    <span class="search" style="width:280px;">${I.search(16)} ابحث برقم الطلب أو اسم العميل أو الهاتف</span>
    <span class="chip">المحافظة ${I.chevD(14)}</span>
    <span class="chip">طريقة الدفع ${I.chevD(14)}</span>
    <span class="chip">${I.cal(14)} آخر 7 أيام ${I.chevD(14)}</span>
    <span class="chip on">${I.alert(14)} متأخرة فقط</span>
    <span style="margin-right:auto;" class="row"><span class="btn btn-s">${I.dl(16)} تصدير</span></span>
  </div>
  <div class="row" style="margin:0 20px 12px 20px; padding:10px 16px; border-radius:12px; background:${T.lapis50}; gap:12px;">
    <span style="font-size:13px; font-weight:800; color:${T.lapis800};">3 طلبات محددة</span>
    <span class="btn btn-p btn-sm">تغيير الحالة ${I.chevD(14)}</span>
    <span class="btn btn-s btn-sm">${I.print(14)} طباعة قائمة التجهيز</span>
    <a class="link" href="#" style="margin-right:auto;">إلغاء التحديد</a>
  </div>
  <table>
    <thead><tr><th style="width:44px;"><span style="display:inline-block; width:16px; height:16px; border-radius:4px; border:1.5px solid ${T.stone300};"></span></th><th>رقم الطلب</th><th>العميل</th><th>المنطقة</th><th>القطع</th><th>الإجمالي</th><th>الدفع</th><th>الحالة</th><th>منذ</th><th>الإجراء التالي</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr${i < 3 ? ` style="background:${T.lapis50}40;"` : ""}>
      <td><span style="display:inline-block; width:16px; height:16px; border-radius:4px; border:1.5px solid ${i < 3 ? T.lapis800 : T.stone300}; background:${i < 3 ? T.lapis800 : "#fff"}; color:#fff;">${i < 3 ? I.check(12) : ""}</span></td>
      <td class="num" style="font-weight:700;">${r[0]}</td><td style="font-weight:700;">${r[1]}</td><td style="color:${T.inkSoft};">${r[2]}</td><td class="num">${r[3]}</td><td class="num" style="font-weight:700;">${r[4]} <span style="font-size:11px; color:${T.inkSoft};">ج.م</span></td><td style="color:${T.inkSoft};">${r[5]}</td><td>${st[r[6]]}</td><td style="color:${T.inkSoft};">${r[7]}</td><td><span class="btn ${r[9]} btn-sm">${r[8]}</span></td>
    </tr>`).join("")}</tbody>
  </table>
  <div class="row" style="justify-content:space-between; padding:14px 20px;">
    <span style="font-size:12px; color:${T.inkSoft};">عرض 1–8 من 321</span>
    <div class="row" style="gap:6px;">${["‹", "1", "2", "3", "…", "41", "›"].map((p, i) => `<span class="num" style="width:30px; height:30px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; ${i === 1 ? `background:${T.lapis800}; color:#fff;` : `border:1px solid ${T.stone200}; color:${T.ink};`}">${p}</span>`).join("")}</div>
  </div>
</div>`;
  files["Orders.dc.html"] = page("orders", "الطلبات", "خط سير الطلبات · مرحلة مرحلة", body, `<span class="btn btn-s">${I.print(16)} طباعة الطلبات الجاهزة</span>`, 900);
}

// 3. OrderDetail
{
  const items = [["تي شيرت رجالي نصف كم سادة", "L · أسود", "3030-01-L-BLK", "2", "320", "640"], ["طقم أطفال فانلة كت وشورت", "XL · أبيض", "8902-5-XL-WHT", "1", "180", "180"]];
  const tl = [["تم إنشاء الطلب", "13 سبتمبر · 09:12", "s"], ["أكّدته أنت", "13 سبتمبر · 09:40", "s"], ["بدء التجهيز", "13 سبتمبر · 10:05", "s"], ["جاهز للتسليم", "— الخطوة التالية", "n"]];
  const body = `
<div class="row" style="justify-content:space-between;">
  <div class="row" style="gap:12px;"><a class="link" href="#">${I.chevR(14)} الطلبات</a><span style="color:${T.stone300};">/</span><span class="num" style="font-size:16px; font-weight:800;">#NK-10476</span>${st.PROCESSING}<span style="font-size:12px; color:${T.inkSoft};">أُنشئ اليوم 09:12 · الدفع عند الاستلام</span></div>
  <div class="row" style="gap:8px;"><span class="btn btn-s">${I.print(16)} طباعة</span><span class="btn btn-s">إلغاء الطلب</span><span class="btn btn-p">${I.check(16)} جاهز للتسليم</span></div>
</div>
<div style="display:grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap:16px; align-items:start;">
  <div style="display:flex; flex-direction:column; gap:16px;">
    <div class="card" style="overflow:hidden;">
      <div class="card-h" style="padding-bottom:10px;"><h2 class="card-t">القطع (3)</h2><span class="chip">${I.print(14)} قائمة تجهيز</span></div>
      <table><thead><tr><th>المنتج</th><th>المقاس · اللون</th><th>SKU</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>${items.map((r) => `<tr><td style="font-weight:700;">${r[0]}</td><td style="color:${T.inkSoft};">${r[1]}</td><td class="num" style="font-size:12px; color:${T.inkSoft};">${r[2]}</td><td class="num">${r[3]}</td><td class="num">${r[4]}</td><td class="num" style="font-weight:700;">${r[5]}</td></tr>`).join("")}</tbody></table>
      <div style="display:flex; justify-content:flex-start; padding:14px 20px; border-top:1px solid ${T.stone100};">
        <div style="width:280px; display:flex; flex-direction:column; gap:6px; font-size:13px;">
          <div class="row" style="justify-content:space-between;"><span style="color:${T.inkSoft};">القطع</span><span class="num">820</span></div>
          <div class="row" style="justify-content:space-between;"><span style="color:${T.inkSoft};">الشحن</span><span class="num">60</span></div>
          <div class="row" style="justify-content:space-between;"><span style="color:${T.inkSoft};">رسوم الدفع عند الاستلام</span><span class="num">10</span></div>
          <div class="row" style="justify-content:space-between; font-weight:800; font-size:15px; border-top:1px solid ${T.stone200}; padding-top:6px;"><span>الإجمالي المحصّل</span><span class="num">890 ج.م</span></div>
        </div>
      </div>
    </div>
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:10px;">
      <h2 class="card-t">ملاحظاتك الداخلية</h2>
      <div class="input" style="height:auto; min-height:72px; align-items:flex-start; padding:10px 12px; color:${T.inkSoft};">العميل طلب الاتصال قبل التوصيل.</div>
      <div><span class="btn btn-s btn-sm">حفظ الملاحظة</span></div>
    </div>
  </div>
  <div style="display:flex; flex-direction:column; gap:16px;">
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:10px;">
      <h2 class="card-t">العميل والتوصيل</h2>
      <div style="font-size:14px; font-weight:800;">كريم ناجي</div>
      <div class="num" style="font-size:13px; color:${T.inkSoft};">+20 100 123 4567</div>
      <div style="font-size:13px; line-height:1.7;">التجمع الخامس · القاهرة<br>شارع التسعين الجنوبي، عمارة 14، الدور 3، شقة 9<br><span style="color:${T.inkSoft};">ملاحظة العميل: الاتصال قبل الوصول</span></div>
      <div class="row" style="gap:8px;"><span class="btn btn-s btn-sm">اتصال</span><span class="btn btn-s btn-sm">واتساب</span><span class="btn btn-s btn-sm">نسخ العنوان</span></div>
    </div>
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:0;">
      <h2 class="card-t" style="margin-bottom:12px;">سجل الطلب</h2>
      ${tl.map((t, i) => `<div style="display:flex; gap:12px; position:relative; padding-bottom:${i < tl.length - 1 ? 16 : 0}px;">
        <div style="display:flex; flex-direction:column; align-items:center;"><span style="width:10px; height:10px; border-radius:999px; background:${t[2] === "s" ? T.malText : T.stone300}; margin-top:5px;"></span>${i < tl.length - 1 ? `<span style="width:2px; flex:1; background:${T.stone100}; margin-top:4px;"></span>` : ""}</div>
        <div><div style="font-size:13px; font-weight:700; color:${t[2] === "s" ? T.ink : T.inkSoft};">${t[0]}</div><div style="font-size:12px; color:${T.inkSoft};">${t[1]}</div></div>
      </div>`).join("")}
    </div>
    <div class="card" style="padding:14px 20px; background:${T.gold50}; box-shadow:none; display:flex; gap:10px; align-items:flex-start;"><span style="color:${T.gold600};">${I.clock(18)}</span><div style="font-size:12px; line-height:1.6;"><b>مهلة الشحن:</b> يتبقى 38 ساعة قبل أن يُعدّ هذا الطلب متأخرًا وفق إعداداتك (48 ساعة).</div></div>
  </div>
</div>`;
  files["OrderDetail.dc.html"] = page("orders", "تفاصيل الطلب", "الطلبات · #NK-10476", body, "", 900);
}

// 4. Stock hub
{
  const rows = [
    ["تي شيرت رجالي نصف كم سادة", "XXL · أسود", "3030-01-XXL-BLK", "4", "4", "0", "0", "5", "d"],
    ["طقم أطفال فانلة كت وشورت", "XXL · أبيض", "8902-5-XXL-WHT", "3", "1", "2", "4", "5", "d"],
    ["برا حريمي مشجر أستك", "XXL", "NK-9090-11-XXL", "6", "2", "4", "9", "5", "w"],
    ["تي شيرت رجالي نصف كم سادة", "M · أسود", "3030-01-M-BLK", "7", "1", "6", "12", "5", "w"],
    ["بيجامة قطن رجالي", "L · كحلي", "5540-2-L-NVY", "28", "3", "25", "41", "5", "s"],
    ["فانلة حمالة رجالي حوض واسع", "XL · أبيض", "NK-1111-XL-WHT", "64", "5", "59", "88", "8", "s"],
    ["شراب قطن قصير (3 أزواج)", "موحد", "7710-3-OS", "142", "9", "133", "120+", "10", "s"],
  ];
  const body = `
<div class="card" style="overflow:hidden;">
  <div style="padding:8px 20px 0 20px;"><div class="tabs">
    <span class="tab on">${I.box(15)} المخزون</span><span class="tab">${I.layers(15)} الحركات</span><span class="tab">${I.truck(15)} الاستلام من المصنع</span><span class="tab">${I.check(15)} الجرد</span><span class="tab">${I.users(15)} طلبات التوريد <span class="cnt">2</span></span>
  </div></div>
  <div class="row" style="padding:14px 20px; gap:10px; flex-wrap:wrap;">
    <span class="search" style="width:280px;">${I.search(16)} ابحث بالاسم أو SKU</span>
    <span class="chip">الفئة ${I.chevD(14)}</span>
    <span class="chip on">${I.alert(14)} تحت الحد فقط <span class="cnt" style="background:#fff2; color:#fff;">12</span></span>
    <span class="chip">نفد</span>
    <span style="margin-right:auto;" class="row"><span class="btn btn-s">${I.dl(16)} تصدير</span><span class="btn btn-s">${I.ul(16)} استيراد</span><span class="btn btn-g">${I.trend(16)} مقترح إعادة الطلب</span></span>
  </div>
  <table>
    <thead><tr><th>المنتج</th><th>المقاس · اللون</th><th>SKU</th><th>متاح</th><th>محجوز</th><th>قابل للبيع</th><th>تغطية (يوم)</th><th>الحد</th><th>تعديل سريع</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td style="font-weight:700;">${r[0]}</td><td style="color:${T.inkSoft};">${r[1]}</td><td class="num" style="font-size:12px; color:${T.inkSoft};">${r[2]}</td><td class="num">${r[3]}</td><td class="num" style="color:${T.inkSoft};">${r[4]}</td>
      <td><span class="pill pill-${r[8]}"><i></i><span class="num">${r[5]}</span></span></td>
      <td class="num">${r[6]}</td><td class="num" style="color:${T.inkSoft};">${r[7]}</td>
      <td><span class="row" style="gap:4px;"><span class="btn btn-s btn-sm num" style="width:32px; padding:0;">−</span><span class="input num" style="height:32px; width:56px; justify-content:center; padding:0;">0</span><span class="btn btn-s btn-sm num" style="width:32px; padding:0;">+</span></span></td>
    </tr>`).join("")}</tbody>
  </table>
  <div class="row" style="justify-content:space-between; padding:14px 20px;"><span style="font-size:12px; color:${T.inkSoft};">عرض 1–7 من 954 صنفًا</span><span style="font-size:12px; color:${T.inkSoft};">الحد يُحسب لكل منتج ← فئة ← الافتراضي (5)</span></div>
</div>
<div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:16px;">
  <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:10px;">
    <div class="row" style="justify-content:space-between;"><h2 class="card-t">الاستلام من المصنع</h2><span class="btn btn-p btn-sm">${I.plus(14)} استلام جديد</span></div>
    <div style="font-size:12px; color:${T.inkSoft}; line-height:1.7;">صدّر ملف الجرد، عبّئ الكميات المستلمة، ثم استورده لمراجعته قبل التطبيق. كل استلام يُسجَّل ويُطبع.</div>
    <div class="row" style="gap:6px;"><span class="chip" style="height:28px;">1</span><span style="font-size:12px;">تصدير</span><span style="color:${T.stone300};">→</span><span class="chip" style="height:28px;">2</span><span style="font-size:12px;">تعبئة</span><span style="color:${T.stone300};">→</span><span class="chip" style="height:28px;">3</span><span style="font-size:12px;">استيراد ومراجعة</span><span style="color:${T.stone300};">→</span><span class="chip on" style="height:28px;">4</span><span style="font-size:12px;">تطبيق</span></div>
  </div>
  <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:10px;">
    <h2 class="card-t">آخر الاستلامات</h2>
    ${[["FR-0091", "11 سبتمبر", "140 قطعة", "10,920 ج.م"], ["FR-0090", "4 سبتمبر", "220 قطعة", "16,840 ج.م"], ["FR-0089", "28 أغسطس", "96 قطعة", "7,410 ج.م"]].map((r) => `<div class="row" style="justify-content:space-between; font-size:12px; border-top:1px solid ${T.stone100}; padding-top:8px;"><span class="num" style="font-weight:700;">${r[0]}</span><span style="color:${T.inkSoft};">${r[1]}</span><span class="num">${r[2]}</span><span class="num" style="font-weight:700;">${r[3]}</span></div>`).join("")}
  </div>
  <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:10px;">
    <div class="row" style="justify-content:space-between;"><h2 class="card-t">طلبات التوريد الواردة</h2>${pill("w", "2 بانتظارك")}</div>
    ${[["موزع المعادي", "8 أصناف · 46 قطعة", "منذ يومين"], ["موزع حلوان", "3 أصناف · 12 قطعة", "منذ 5 ساعات"]].map((r) => `<div class="row" style="justify-content:space-between; border-top:1px solid ${T.stone100}; padding-top:8px;"><div><div style="font-size:13px; font-weight:700;">${r[0]}</div><div style="font-size:12px; color:${T.inkSoft};">${r[1]} · ${r[2]}</div></div><span class="btn btn-s btn-sm">مراجعة</span></div>`).join("")}
  </div>
</div>`;
  files["Stock.dc.html"] = page("stock", "المخزون", "954 صنفًا · 1,284 قطعة قابلة للبيع", body, "", 1000);
}

// 5. Report — Sales
{
  const periodBar = (label) => `
<div class="card" style="padding:12px 20px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
  <div class="row" style="gap:4px;">${["اليوم", "7 أيام", "30 يومًا", "هذا الشهر", "الشهر الماضي", "مخصص"].map((p, i) => `<span class="chip${i === 2 ? " on" : ""}" style="height:30px;">${p}</span>`).join("")}</div>
  <span style="font-size:12px; color:${T.inkSoft};">14 أغسطس – 13 سبتمبر · مقارنةً بـ 15 يوليو – 13 أغسطس</span>
  <span style="margin-right:auto;" class="row" style="gap:8px;"><span class="btn btn-s btn-sm">${I.file(14)} جدول</span><span class="btn btn-s btn-sm">${I.dl(14)} CSV</span></span>
</div>`;
  const tile = (l, v, d, u = "") => `<div class="card" style="padding:16px 18px; display:flex; flex-direction:column; gap:8px;"><span style="font-size:12px; font-weight:700; color:${T.inkSoft};">${l}</span><span class="num" style="font-size:24px; font-weight:800;">${v}${u ? ` <span style="font-size:12px; color:${T.inkSoft}; font-weight:700;">${u}</span>` : ""}</span>${d}</div>`;
  const rows = [["تي شيرت رجالي نصف كم سادة", "412", "131,840", "+18%", "s"], ["بيجامة قطن رجالي", "168", "80,640", "+6%", "s"], ["طقم أطفال فانلة كت وشورت", "203", "36,540", "−4%", "d"], ["فانلة حمالة رجالي حوض واسع", "391", "46,920", "+2%", "s"], ["شراب قطن قصير (3 أزواج)", "512", "30,720", "+11%", "s"]];
  const body = `
${periodBar()}
<div style="display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:16px;">
  ${tile("الإيراد", "184,320", up("+12%"), "ج.م")}${tile("الطلبات", "1,046", up("+8%"))}${tile("القطع", "2,318", up("+15%"))}${tile("متوسط الطلب", "176", up("+4%"), "ج.م")}${tile("نسبة الإلغاء", "6.1%", down("+0.8 نقطة"))}
</div>
<div style="display:grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap:16px;">
  <div class="card">
    <div class="card-h"><div><h2 class="card-t">الإيراد اليومي</h2><p class="card-s">الخط الباهت هو الفترة السابقة</p></div></div>
    <div style="padding:8px 12px 12px 12px;">${lineChart(760, 240, rev30, ["14 أغسطس", "21 أغسطس", "28 أغسطس", "5 سبتمبر", "13 سبتمبر"])}</div>
  </div>
  <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:12px;">
    <h2 class="card-t">ما يستحق فعلًا</h2>
    <div style="font-size:12px; color:${T.inkSoft};">مستنتج من هذا التقرير</div>
    ${[["3 أصناف من الأكثر مبيعًا ستنفد خلال 5 أيام", "افتح مقترح إعادة الطلب", "d"], ["نسبة الإلغاء في حلوان 14% — ضعف المتوسط", "اعرض طلبات حلوان", "w"], ["إنستاباي 31% من الطلبات، بارتفاع 9 نقاط", "—", "n"]].map((a) => `<div style="display:flex; gap:10px; border-top:1px solid ${T.stone100}; padding-top:10px;"><span class="pill pill-${a[2]}" style="padding:3px 6px;"><i></i></span><div><div style="font-size:13px; font-weight:700; line-height:1.5;">${a[0]}</div>${a[1] !== "—" ? `<a class="link" href="#">${a[1]} ${I.chevL(12)}</a>` : ""}</div></div>`).join("")}
  </div>
</div>
<div class="card" style="overflow:hidden;">
  <div style="padding:8px 20px 0 20px;"><div class="tabs"><span class="tab on">حسب المنتج</span><span class="tab">حسب الفئة</span><span class="tab">حسب المحافظة</span><span class="tab">حسب طريقة الدفع</span><span class="tab">حسب اليوم</span></div></div>
  <table><thead><tr><th>المنتج</th><th>القطع</th><th>الإيراد</th><th>مقارنة بالفترة السابقة</th><th>حصة الإيراد</th></tr></thead>
  <tbody>${rows.map((r) => `<tr><td style="font-weight:700;">${r[0]}</td><td class="num">${r[1]}</td><td class="num" style="font-weight:700;">${r[2]}</td><td><span class="delta delta-${r[4] === "s" ? "up" : "down"}"><span class="num">${r[3]}</span></span></td><td><div class="row" style="gap:8px;"><div class="meter" style="width:120px; height:6px;"><i style="width:${Math.round(parseInt(r[2].replace(/,/g, "")) / 1843)}%;"></i></div><span class="num" style="font-size:12px; color:${T.inkSoft};">${Math.round(parseInt(r[2].replace(/,/g, "")) / 1843)}%</span></div></td></tr>`).join("")}</tbody></table>
  <div class="row" style="justify-content:space-between; padding:14px 20px;"><span style="font-size:12px; color:${T.inkSoft};">عرض 1–5 من 86 منتجًا</span><a class="link" href="#">عرض الكل ${I.chevL(12)}</a></div>
</div>`;
  files["ReportSales.dc.html"] = page("reports", "تقرير المبيعات", "التقارير · المبيعات · التجهيز · المخزون · الشبكة · المال", body, `<div class="row" style="gap:4px;">${["المبيعات", "التجهيز", "المخزون", "الشبكة", "المال"].map((p, i) => `<span class="chip${i === 0 ? " on" : ""}">${p}</span>`).join("")}</div>`, 1180);
}

// 6. Report — Inventory
{
  const tile = (l, v, d, u = "") => `<div class="card" style="padding:16px 18px; display:flex; flex-direction:column; gap:8px;"><span style="font-size:12px; font-weight:700; color:${T.inkSoft};">${l}</span><span class="num" style="font-size:24px; font-weight:800;">${v}${u ? ` <span style="font-size:12px; color:${T.inkSoft}; font-weight:700;">${u}</span>` : ""}</span>${d}</div>`;
  const rows = [
    ["تي شيرت رجالي نصف كم سادة", "XXL · أسود", "0", "3.1", "0", "—", "9", "22", "d"],
    ["طقم أطفال فانلة كت وشورت", "XXL · أبيض", "2", "4.0", "4", "—", "3", "26", "d"],
    ["برا حريمي مشجر أستك", "XXL", "4", "1.2", "23", "—", "0", "5", "w"],
    ["بيجامة قطن رجالي", "L · كحلي", "25", "2.8", "62", "—", "0", "0", "s"],
    ["جلابية قطن رجالي", "XL · بيج", "31", "0.0", "∞", "راكد 74 يومًا", "0", "0", "n"],
    ["شراب قطن قصير (3 أزواج)", "موحد", "133", "7.5", "124", "—", "0", "0", "s"],
  ];
  const body = `
<div class="card" style="padding:12px 20px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
  <div class="row" style="gap:4px;">${["7 أيام", "30 يومًا", "90 يومًا", "مخصص"].map((p, i) => `<span class="chip${i === 1 ? " on" : ""}" style="height:30px;">${p}</span>`).join("")}</div>
  <span style="font-size:12px; color:${T.inkSoft};">سرعة البيع محسوبة على آخر 30 يومًا · هدف التغطية 21 يومًا · الراكد = بلا بيع 60 يومًا</span>
  <span style="margin-right:auto;" class="row" style="gap:8px;"><span class="btn btn-s btn-sm">${I.cog(14)} تعديل الأهداف</span><span class="btn btn-s btn-sm">${I.dl(14)} CSV</span></span>
</div>
<div style="display:grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap:16px;">
  ${tile("قابل للبيع", "1,284", flat("قطعة"))}${tile("القيمة بالتكلفة", "96,300", flat("بنسبتك 72%"), "ج.م")}${tile("القيمة بسعر البيع", "128,400", flat(""), "ج.م")}${tile("متوسط التغطية", "18", down("−3 أيام"), "يوم")}${tile("أصناف راكدة", "23", down("+4"))}${tile("أيام نفاد", "41", down("+12"))}
</div>
<div style="display:grid; grid-template-columns: minmax(0, 1fr) 360px; gap:16px; align-items:start;">
  <div class="card" style="overflow:hidden;">
    <div class="card-h" style="padding-bottom:10px;"><div><h2 class="card-t">حسب الصنف</h2><p class="card-s">مرتب حسب الأقرب للنفاد</p></div><div class="row" style="gap:6px;"><span class="chip on" style="height:28px;">يحتاج طلبًا</span><span class="chip" style="height:28px;">راكد</span><span class="chip" style="height:28px;">الكل</span></div></div>
    <table><thead><tr><th>المنتج</th><th>المقاس · اللون</th><th>قابل للبيع</th><th>يبيع/أسبوع</th><th>تغطية (يوم)</th><th>الحالة</th><th>أيام نفاد</th><th>مقترح الطلب</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td style="font-weight:700;">${r[0]}</td><td style="color:${T.inkSoft};">${r[1]}</td><td><span class="pill pill-${r[8]}"><i></i><span class="num">${r[2]}</span></span></td><td class="num">${r[3]}</td><td class="num">${r[4]}</td><td style="font-size:12px; color:${T.inkSoft};">${r[5]}</td><td class="num">${r[6]}</td><td class="num" style="font-weight:800; color:${r[7] !== "0" ? T.lapis800 : T.stone300};">${r[7]}</td></tr>`).join("")}</tbody></table>
    <div class="row" style="justify-content:space-between; padding:14px 20px;"><span style="font-size:12px; color:${T.inkSoft};">عرض 1–6 من 954</span><span style="font-size:12px; color:${T.inkSoft};">مقترح الطلب = هدف التغطية × سرعة البيع − القابل للبيع</span></div>
  </div>
  <div style="display:flex; flex-direction:column; gap:16px;">
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:12px; background:${T.lapis800}; color:#fff;">
      <div class="row" style="justify-content:space-between;"><h2 class="card-t" style="color:#fff;">قائمة إعادة الطلب</h2><span class="pill" style="background:${T.gold500}; color:${T.lapis900};">37 صنفًا</span></div>
      <div style="font-size:12px; color:#ffffffb3; line-height:1.7;">مجهزة بصيغة ملف الاستلام من المصنع. أرسلها للمصنع كما هي، وعند وصول البضاعة استوردها كاستلام.</div>
      <div class="row" style="justify-content:space-between; font-size:13px;"><span style="color:#ffffffb3;">إجمالي القطع</span><span class="num" style="font-weight:800;">612</span></div>
      <div class="row" style="justify-content:space-between; font-size:13px;"><span style="color:#ffffffb3;">التكلفة التقديرية</span><span class="num" style="font-weight:800;">46,800 ج.م</span></div>
      <span class="btn btn-g">${I.dl(16)} تصدير للمصنع</span>
    </div>
    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; gap:10px;">
      <h2 class="card-t">الراكد</h2>
      <div style="font-size:12px; color:${T.inkSoft}; line-height:1.7;">23 صنفًا بلا بيع منذ 60 يومًا أو أكثر — قيمتها بالتكلفة <b class="num">7,140 ج.م</b>. ضعها في عرض أو حوّلها لموزع يبيعها.</div>
      <a class="link" href="#">اعرض الأصناف الراكدة ${I.chevL(12)}</a>
    </div>
  </div>
</div>`;
  files["ReportInventory.dc.html"] = page("reports", "تقرير المخزون", "التقارير · المخزون", body, `<div class="row" style="gap:4px;">${["المبيعات", "التجهيز", "المخزون", "الشبكة", "المال"].map((p, i) => `<span class="chip${i === 2 ? " on" : ""}">${p}</span>`).join("")}</div>`, 1060);
}

// 7. Money
{
  const body = `
<div class="card" style="padding:12px 20px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
  <div class="row" style="gap:4px;">${["هذا الشهر", "الشهر الماضي", "3 أشهر", "منذ البداية", "مخصص"].map((p, i) => `<span class="chip${i === 0 ? " on" : ""}" style="height:30px;">${p}</span>`).join("")}</div>
  <span style="font-size:12px; color:${T.inkSoft};">1 – 13 سبتمبر 2026 · الأرصدة تراكمية منذ البداية</span>
  <span style="margin-right:auto;" class="btn btn-s btn-sm">${I.file(14)} كشف حساب</span>
</div>
<div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:16px;">
  <div class="card" style="padding:20px; display:flex; flex-direction:column; gap:14px;">
    <div class="row" style="justify-content:space-between;"><div><h2 class="card-t">حسابك مع المصنع</h2><p class="card-s">تشتري البضاعة بنسبتك (72% من سعر البيع) عند الاستلام · تحددها الإدارة</p></div><span class="well">${I.truck(18)}</span></div>
    <div class="row" style="justify-content:space-between; font-size:13px;"><span style="color:${T.inkSoft};">قيمة البضاعة المستلمة</span><span class="num" style="font-weight:700;">96,400</span></div>
    <div class="row" style="justify-content:space-between; font-size:13px;"><span style="color:${T.inkSoft};">دفعاتك المقدمة وأقساطك</span><span class="num" style="font-weight:700;">− 60,000</span></div>
    <div class="row" style="justify-content:space-between; border-top:1px solid ${T.stone200}; padding-top:12px;"><span style="font-size:14px; font-weight:800;">المتبقي عليك</span><span class="num" style="font-size:26px; font-weight:800; color:${T.carn600};">36,400 <span style="font-size:12px; color:${T.inkSoft};">ج.م</span></span></div>
    <div style="font-size:12px; color:${T.inkSoft};">آخر قسط: 20,000 ج.م في 6 سبتمبر · القسط القادم 15,000 ج.م في 20 سبتمبر · تسجله الإدارة</div>
  </div>
  <div class="card" style="padding:20px; display:flex; flex-direction:column; gap:14px;">
    <div class="row" style="justify-content:space-between;"><div><h2 class="card-t">نقدك من العملاء</h2><p class="card-s">أنت من يحصّل ثمن ما تبيعه</p></div><span class="well">${I.coins(18)}</span></div>
    <div class="row" style="justify-content:space-between; font-size:13px;"><span style="color:${T.inkSoft};">محصّل — الدفع عند الاستلام</span><span class="num" style="font-weight:700;">41,200</span></div>
    <div class="row" style="justify-content:space-between; font-size:13px;"><span style="color:${T.inkSoft};">محصّل — إنستاباي</span><span class="num" style="font-weight:700;">17,700</span></div>
    <div class="row" style="justify-content:space-between; font-size:13px;"><span style="color:${T.inkSoft};">بانتظار التحصيل (مشحون ولم يُسلَّم)</span><span class="num" style="font-weight:700; color:${T.gold600};">9,850</span></div>
    <div class="row" style="justify-content:space-between; border-top:1px solid ${T.stone200}; padding-top:12px;"><span style="font-size:14px; font-weight:800;">هامشك التقديري (28%)</span><span class="num" style="font-size:26px; font-weight:800; color:${T.malText};">14,725 <span style="font-size:12px; color:${T.inkSoft};">ج.م</span></span></div>
  </div>
</div>
<div style="display:grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap:16px; align-items:start;">
  <div class="card" style="overflow:hidden;">
    <div class="card-h" style="padding-bottom:10px;"><h2 class="card-t">استلامات المصنع</h2><a class="link" href="#">كل الاستلامات ${I.chevL(12)}</a></div>
    <table><thead><tr><th>المرجع</th><th>التاريخ</th><th>القطع</th><th>القيمة بنسبتك</th></tr></thead>
    <tbody>${[["FR-0091", "11 سبتمبر", "140", "10,920"], ["FR-0090", "4 سبتمبر", "220", "16,840"], ["FR-0089", "28 أغسطس", "96", "7,410"], ["FR-0088", "19 أغسطس", "310", "24,180"]].map((r) => `<tr><td class="num" style="font-weight:700;">${r[0]}</td><td style="color:${T.inkSoft};">${r[1]}</td><td class="num">${r[2]}</td><td class="num" style="font-weight:700;">${r[3]}</td></tr>`).join("")}</tbody></table>
  </div>
  <div style="display:flex; flex-direction:column; gap:16px;">
    <div class="card" style="overflow:hidden;">
      <div class="card-h" style="padding-bottom:10px;"><h2 class="card-t">الدفعات المقدمة والأقساط</h2></div>
      <table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>المرجع</th></tr></thead>
      <tbody>${[["6 سبتمبر", "20,000", "قسط · تحويل بنكي"], ["22 أغسطس", "25,000", "قسط · نقدًا"], ["19 أغسطس", "15,000", "دفعة مقدمة على FR-0088"]].map((r) => `<tr><td style="color:${T.inkSoft};">${r[0]}</td><td class="num" style="font-weight:700;">${r[1]}</td><td style="color:${T.inkSoft};">${r[2]}</td></tr>`).join("")}</tbody></table>
    </div>
    <div class="card">
      <div class="card-h"><h2 class="card-t">التحصيل الأسبوعي</h2></div>
      <div style="padding:8px 12px 12px 12px;">${barChart(560, 160, [9800, 12400, 11100, 14200, 11400], ["16 أغسطس", "23 أغسطس", "30 أغسطس", "6 سبتمبر", "13 سبتمبر"])}</div>
    </div>
  </div>
</div>`;
  files["Money.dc.html"] = page("reports", "المال", "التقارير · المال", body, `<div class="row" style="gap:4px;">${["المبيعات", "التجهيز", "المخزون", "الشبكة", "المال"].map((p, i) => `<span class="chip${i === 4 ? " on" : ""}">${p}</span>`).join("")}</div>`, 1060);
}

// 8. Settings
{
  const sec = (title, sub, inner) => `<div class="card" style="padding:20px; display:grid; grid-template-columns: 260px minmax(0, 1fr); gap:24px;"><div><h2 class="card-t">${title}</h2><p class="card-s" style="line-height:1.7;">${sub}</p></div><div style="display:flex; flex-direction:column; gap:14px;">${inner}</div></div>`;
  const body = `
${sec("ملف العمل", "يحدد ما تراه في «اليوم»: مقياس الطاقة، وقاعدة التأخير، وأيام الراحة.", `
  <div class="field"><label>أيام العمل</label><div class="row" style="gap:6px;">${["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"].map((d, i) => `<span class="chip${i < 6 ? " on" : ""}">${d}</span>`).join("")}</div></div>
  <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:14px;">
    <div class="field"><label>الطاقة اليومية (طلب)</label><span class="input num">40</span></div>
    <div class="field"><label>مهلة التأكيد (ساعة)</label><span class="input num">24</span></div>
    <div class="field"><label>مهلة الشحن بعد التأكيد (ساعة)</label><span class="input num">48</span></div>
  </div>
  <div><span class="btn btn-p btn-sm">حفظ</span></div>`)}
${sec("حدود المخزون", "الحد الذي يُعد الصنف عنده منخفضًا. يُحسب لكل منتج ← فئة ← الافتراضي.", `
  <div class="field" style="max-width:220px;"><label>الحد الافتراضي</label><span class="input num">5</span></div>
  <table style="border:1px solid ${T.stone100}; border-radius:12px; overflow:hidden;"><thead><tr><th>الفئة</th><th>الحد</th><th></th></tr></thead><tbody>
    ${[["رجالي", "8"], ["حريمي", "5"], ["أطفال", "5"], ["شرابات", "12"]].map((r) => `<tr><td style="font-weight:700;">${r[0]}</td><td><span class="input num" style="width:80px; height:32px;">${r[1]}</span></td><td style="text-align:left;"><a class="link" href="#">إزالة</a></td></tr>`).join("")}
  </tbody></table>
  <div class="row" style="gap:8px;"><span class="search" style="width:320px;">${I.search(16)} أضف حدًا خاصًا لمنتج بعينه…</span><span style="font-size:12px; color:${T.inkSoft};">3 منتجات لها حد خاص</span></div>
  <div><span class="btn btn-p btn-sm">حفظ</span></div>`)}
${sec("التنبيهات", "ما يظهر في الجرس وفي «اليوم». كل التنبيهات داخل البوابة فقط.", `
  ${[["طلب جديد مُسند إليك", true], ["طلب تجاوز مهلة التأكيد أو الشحن", true], ["صنف نزل تحت الحد", true], ["طلب توريد جديد من موزع", true], ["نفاد صنف بالكامل", true], ["ملخص يومي عند بداية يوم العمل", false]].map((a) => `<div class="row" style="justify-content:space-between; border-top:1px solid ${T.stone100}; padding-top:12px;"><span style="font-size:13px; font-weight:600;">${a[0]}</span><span class="toggle${a[1] ? "" : " off"}"><b></b></span></div>`).join("")}`)}
${sec("حسابك مع المصنع", "نسبة شرائك تحددها الإدارة ولا تُعدَّل من هنا. تُستخدم في تقرير المال وقيمة المخزون.", `<div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:14px;"><div class="field"><label>نسبة الشراء من سعر البيع</label><span class="input num" style="background:${T.stone100}; color:${T.inkSoft};">72%</span></div><div class="field"><label>هامشك</label><span class="input num" style="background:${T.stone100}; color:${T.inkSoft};">28%</span></div><div class="field"><label>طريقة السداد</label><span class="input" style="background:${T.stone100}; color:${T.inkSoft};">دفعة مقدمة + أقساط</span></div></div>`)}
${sec("مناطق الخدمة", "للعلم فقط في هذه المرحلة: تظهر للإدارة ولا تغيّر توجيه الطلبات.", `
  <div class="field"><label>المحافظات والمناطق</label><div class="row" style="gap:6px; flex-wrap:wrap;">${["القاهرة · مدينة نصر", "القاهرة · المعادي", "القاهرة · مصر الجديدة", "القاهرة · التجمع", "القليوبية · العبور"].map((a) => `<span class="chip on">${a} ×</span>`).join("")}<span class="chip">${I.plus(14)} إضافة</span></div></div>`)}
${sec("طريقة التسليم", "الافتراضي عند تجهيز الطلب. يمكنك تغييره لكل طلب.", `
  <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:12px;">
    ${[["شركة شحن", "يُستلم من عندك ويُشحن", true], ["استلام من المحل", "العميل يأتي إليك", false], ["توصيل خاص", "مندوبك يوصّل بنفسه", false]].map((o) => `<div style="border:2px solid ${o[2] ? T.lapis800 : T.stone200}; border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:4px;"><div class="row" style="justify-content:space-between;"><span style="font-size:13px; font-weight:800;">${o[0]}</span><span style="width:16px; height:16px; border-radius:999px; border:2px solid ${o[2] ? T.lapis800 : T.stone300}; background:${o[2] ? T.lapis800 : "#fff"}; box-shadow: inset 0 0 0 3px #fff;"></span></div><span style="font-size:12px; color:${T.inkSoft};">${o[1]}</span></div>`).join("")}
  </div>`)}`;
  files["Settings.dc.html"] = page("settings", "الإعدادات", "كل ما يجعل البوابة تعمل بطريقتك", body, "", 1280);
}

// 9–10. Mobile
function mobile(title, body, h = 844) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><script src="./support.js"></script></head>
<body>
<x-dc>
<helmet><style>${CSS}</style></helmet>
<div dir="rtl" style="width:390px; min-height:${h}px; background:${T.ground}; display:flex; flex-direction:column;">
  <header style="background:#fff; border-bottom:1px solid ${T.stone200}; padding:14px 16px; display:flex; align-items:center; justify-content:space-between;">
    <div class="row" style="gap:10px;"><img src="logo-lapis-mark.png" alt="" style="width:28px; height:28px; object-fit:contain;"><span style="font-size:16px; font-weight:800;">${title}</span></div>
    <div class="row" style="gap:8px;"><span class="icon-btn" style="width:44px; height:44px; position:relative;">${I.bell(18)}<b style="position:absolute; top:10px; right:11px; width:8px; height:8px; border-radius:999px; background:${T.carn500}; border:2px solid #fff;"></b></span><span class="icon-btn" style="width:44px; height:44px;">${I.menu(18)}</span></div>
  </header>
  <div style="padding:16px; display:flex; flex-direction:column; gap:14px; flex:1;">${body}</div>
  <nav style="background:#fff; border-top:1px solid ${T.stone200}; display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding:8px 8px 14px;">
    ${[["اليوم", I.home, title === "اليوم"], ["الطلبات", I.truck, title === "الطلبات"], ["المخزون", I.box, false], ["التقارير", I.chart, false]].map(([l, ic2, on]) => `<div style="display:flex; flex-direction:column; align-items:center; gap:3px; padding:6px 0; border-radius:10px; font-size:11px; font-weight:700; color:${on ? T.lapis800 : T.inkSoft}; ${on ? `background:${T.lapis50};` : ""}">${ic2(20)}<span>${l}</span></div>`).join("")}
  </nav>
</div>
</x-dc>
</body>
</html>`;
}
{
  const mk = (l, v, d) => `<div class="card" style="padding:14px; display:flex; flex-direction:column; gap:6px;"><span style="font-size:11px; font-weight:700; color:${T.inkSoft};">${l}</span><span class="num" style="font-size:22px; font-weight:800;">${v}</span>${d}</div>`;
  const qrow = (a, b, c, btn, p = "btn-s") => `<div class="card" style="padding:12px 14px; display:flex; align-items:center; gap:10px;"><div style="flex:1; min-width:0;"><div class="row" style="gap:8px;"><span class="num" style="font-size:12px; font-weight:700; color:${T.inkSoft};">${a}</span><span style="font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b}</span></div><div style="font-size:12px; color:${T.inkSoft};">${c}</div></div><span class="btn ${p} btn-sm" style="height:36px;">${btn}</span></div>`;
  const body = `
<div style="font-size:12px; color:${T.inkSoft};">السبت 13 سبتمبر · يوم عمل · الطاقة <span class="num">14/40</span></div>
<div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px;">${mk("طلبات اليوم", "18", up("+3"))}${mk("إيراد الأسبوع", "42,350", up("+12%"))}</div>
<div class="row" style="justify-content:space-between;"><span style="font-size:14px; font-weight:800;">بانتظار التأكيد</span>${pill("i", "5")}</div>
${qrow("#NK-10482", "منى عبد الرحمن", "مدينة نصر · 640 ج.م · منذ 25 د", "تأكيد", "btn-p")}
${qrow("#NK-10481", "أحمد سامي", "المعادي · 1,120 ج.م · منذ 40 د", "تأكيد", "btn-p")}
<div class="row" style="justify-content:space-between;"><span style="font-size:14px; font-weight:800;">متأخرة</span>${pill("d", "4")}</div>
${qrow("#NK-10431", "هاني مصطفى", "مؤكد منذ 31 ساعة", "بدء التجهيز")}
<div class="row" style="justify-content:space-between;"><span style="font-size:14px; font-weight:800;">مخزون تحت الحد</span>${pill("w", "12")}</div>
${qrow("3030-01", "تي شيرت رجالي · XXL أسود", "0 قابل للبيع · الحد 5", "+ كمية")}`;
  files["MobileToday.dc.html"] = mobile("اليوم", body);
}
{
  const orow = (id, name, meta, s, btn, p = "btn-s") => `<div class="card" style="padding:12px 14px; display:flex; flex-direction:column; gap:8px;"><div class="row" style="justify-content:space-between;"><span class="num" style="font-size:12px; font-weight:800;">${id}</span>${st[s]}</div><div style="font-size:14px; font-weight:700;">${name}</div><div class="row" style="justify-content:space-between;"><span style="font-size:12px; color:${T.inkSoft};">${meta}</span><span class="btn ${p} btn-sm" style="height:36px;">${btn}</span></div></div>`;
  const body = `
<div style="display:flex; gap:6px; overflow:hidden;">${["بانتظار التأكيد 5", "مؤكد 291", "قيد التجهيز 14", "جاهز 12"].map((t, i) => `<span class="chip${i === 0 ? " on" : ""}" style="flex:none;">${t}</span>`).join("")}</div>
<span class="search">${I.search(16)} ابحث برقم الطلب أو الهاتف</span>
${orow("#NK-10482", "منى عبد الرحمن", "مدينة نصر · 3 قطع · 640 ج.م", "CREATED", "تأكيد", "btn-p")}
${orow("#NK-10481", "أحمد سامي", "المعادي · 5 قطع · 1,120 ج.م", "CREATED", "تأكيد", "btn-p")}
${orow("#NK-10476", "كريم ناجي", "التجمع · 2 قطعة · 560 ج.م", "CONFIRMED", "بدء التجهيز")}
${orow("#NK-10471", "نهى إبراهيم", "حلوان · 4 قطع · 890 ج.م", "PROCESSING", "جاهز للتسليم")}`;
  files["MobileOrders.dc.html"] = mobile("الطلبات", body);
}

// 11. Components sheet
{
  const cell = (t, inner) => `<div style="display:flex; flex-direction:column; gap:10px;"><span style="font-size:11px; font-weight:800; color:${T.inkSoft}; letter-spacing:.04em;">${t}</span><div class="row" style="gap:10px; flex-wrap:wrap; align-items:flex-start;">${inner}</div></div>`;
  const body = `
<div dir="rtl" style="width:1200px; min-height:900px; background:${T.ground}; padding:28px; display:flex; flex-direction:column; gap:26px;">
  <div><h1 style="margin:0; font-size:20px; font-weight:800;">مكونات بوابة الشركاء v2</h1><div style="font-size:12px; color:${T.inkSoft};">Cairo · أرضية stone-50 · بطاقات بيضاء نصف قطرها 16 · لمسات لازورد وذهب</div></div>
  ${cell("الأزرار", `<span class="btn btn-p">أساسي</span><span class="btn btn-s">ثانوي</span><span class="btn btn-g">ذهبي</span><span class="btn btn-p btn-sm">صغير</span><span class="btn btn-s btn-sm">${I.print(14)} بأيقونة</span><span class="icon-btn">${I.bell(18)}</span>`)}
  ${cell("حالات الطلب", `${st.CREATED}${st.CONFIRMED}${st.PROCESSING}${st.READY}${st.SHIPPED}${st.DELIVERED}${st.CANCELLED}`)}
  ${cell("الفروق", `${up("+12%")}${down("−4%")}${flat("—")}`)}
  ${cell("الرقائق والتبويبات", `<span class="chip on">مفعّل</span><span class="chip">عادي</span><span class="chip">${I.cal(14)} بتاريخ ${I.chevD(14)}</span><div class="tabs" style="width:360px;"><span class="tab on">نشط <span class="cnt">5</span></span><span class="tab">عادي <span class="cnt">12</span></span></div>`)}
  ${cell("بطاقة مؤشر", `<div style="width:270px;">${kpi("إيراد هذا الأسبوع", "42,350", "الأسبوع الماضي 37,800", up("+12%"), I.coins, "ج.م")}</div><div style="width:270px;">${kpi("طلبات متأخرة", "4", "تجاوزت 24 ساعة", down("+2"), I.clock)}</div>`)}
  ${cell("الحقول والمقياس والمفاتيح", `<div class="field" style="width:220px;"><label>الطاقة اليومية</label><span class="input num">40</span></div><span class="search" style="width:260px;">${I.search(16)} بحث…</span><div style="width:220px; display:flex; flex-direction:column; gap:6px;"><div class="meter"><i style="width:35%;"></i></div><span class="num" style="font-size:12px; color:${T.inkSoft};">14 / 40</span></div><span class="toggle"><b></b></span><span class="toggle off"><b></b></span>`)}
  ${cell("حالات الشاشة", `
    <div class="card" style="width:340px; padding:18px 20px; display:flex; flex-direction:column; gap:10px;"><div style="height:12px; width:40%; border-radius:6px; background:${T.stone100};"></div><div style="height:26px; width:60%; border-radius:6px; background:${T.stone100};"></div><div style="height:12px; width:80%; border-radius:6px; background:${T.stone100};"></div><span style="font-size:11px; color:${T.inkSoft};">هيكل تحميل بشكل المحتوى</span></div>
    <div class="card" style="width:340px; padding:16px 20px; background:${T.carn50}; box-shadow:none; display:flex; align-items:center; gap:10px;"><span style="color:${T.carn600};">${I.alert(18)}</span><span style="font-size:13px; font-weight:700; color:${T.carn600}; flex:1;">تعذر تحميل البيانات</span><span class="btn btn-s btn-sm">إعادة المحاولة</span></div>
    <div class="card" style="width:340px; padding:28px 20px; display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center;"><span class="well">${I.check(18)}</span><span style="font-size:14px; font-weight:800;">لا شيء يحتاج قرارك الآن</span><span style="font-size:12px; color:${T.inkSoft};">كل الطلبات في مسارها والمخزون فوق الحد.</span></div>`)}
</div>`;
  files["Components.dc.html"] = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><script src="./support.js"></script></head><body><x-dc><helmet><style>${CSS}</style></helmet>${body}</x-dc></body></html>`;
}

// canvas layout
const canvas = {
  artboards: [
    { file: "Main.dc.html", title: "اليوم", x: 0, y: 0, w: 1440, h: 1240 },
    { file: "Orders.dc.html", title: "الطلبات", x: 1540, y: 0, w: 1440, h: 900 },
    { file: "OrderDetail.dc.html", title: "تفاصيل الطلب", x: 3080, y: 0, w: 1440, h: 900 },
    { file: "Stock.dc.html", title: "المخزون", x: 0, y: 1400, w: 1440, h: 1000 },
    { file: "ReportSales.dc.html", title: "تقرير المبيعات", x: 1540, y: 1400, w: 1440, h: 1180 },
    { file: "ReportInventory.dc.html", title: "تقرير المخزون", x: 3080, y: 1400, w: 1440, h: 1060 },
    { file: "Money.dc.html", title: "المال", x: 0, y: 2760, w: 1440, h: 1060 },
    { file: "Settings.dc.html", title: "الإعدادات", x: 1540, y: 2760, w: 1440, h: 1280 },
    { file: "MobileToday.dc.html", title: "موبايل · اليوم", x: 3080, y: 2760, w: 390, h: 844 },
    { file: "MobileOrders.dc.html", title: "موبايل · الطلبات", x: 3560, y: 2760, w: 390, h: 844 },
    { file: "Components.dc.html", title: "المكونات", x: 0, y: 4200, w: 1200, h: 900 },
  ],
  annotations: [
    { id: "brief", x: 0, y: -170, w: 520, text: "بوابة الشركاء v2 — اتجاه فاتح: شريط جانبي أبيض على أرضية stone-50، بطاقات مستديرة 16، مؤشرات مع فروق، رسم اتجاه، طابور إجراءات أولًا.\nالأرقام عينة للتوضيح. المراجعة قبل كتابة مهام التنفيذ (docs/redesign/05-partner-portal-v2.md §3)." },
  ],
  launch: { view: "canvas" },
};

for (const [name, src] of Object.entries(files)) fs.writeFileSync(path.join(out, name), src, "utf8");
fs.writeFileSync(path.join(out, "canvas.json"), JSON.stringify(canvas, null, 2), "utf8");
console.log("wrote", Object.keys(files).length, "artboards + canvas.json to", out);
