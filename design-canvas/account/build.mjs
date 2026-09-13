// Generates the account-area artboards (.dc.html): site navbar + mobile drawer, profile,
// addresses, orders — desktop 1440 and phone 390 — in the storefront's visual language
// (docs/redesign/design-canvas/design-storefront/store-front/Storefront v3.dc.html).
// Run: node design-canvas/account/build.mjs
import fs from "node:fs";
import path from "node:path";

const out = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

// ---- tokens (the shipped storefront, app/globals.css + Storefront v3 canvas) ----
const T = {
  ivory: "#F7F4EE",
  paper: "#FFFDFA",
  sand: "#E7E2D8",
  sandSoft: "#EFEAE0",
  ink: "#151A35",
  ink80: "rgba(21,26,53,.8)",
  ink60: "rgba(21,26,53,.6)",
  muted: "#8A8C9A",
  rule: "rgba(21,26,53,.16)",
  ruleSoft: "rgba(21,26,53,.09)",
  gold: "#B8902F",
  goldSoft: "rgba(184,144,47,.14)",
  carn: "#A83A2A",
  carnSoft: "rgba(168,58,42,.10)",
  malachite: "#2F6B4C",
  malSoft: "rgba(47,107,76,.12)",
  amber: "#9A6B12",
  amberSoft: "rgba(184,144,47,.16)",
};

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600&family=Archivo:wght@400;500;600&display=swap" rel="stylesheet">`;

const CSS = `
  * { box-sizing:border-box; }
  body { margin:0; background:${T.ivory}; color:${T.ink}; font-family:'IBM Plex Sans Arabic', Tahoma, sans-serif; font-size:15px; line-height:1.6; -webkit-font-smoothing:antialiased; }
  a { color:inherit; text-decoration:none; }
  h1,h2,h3 { font-family:Amiri, serif; font-weight:700; margin:0; line-height:1.2; }
  .num { font-family:Archivo, sans-serif; direction:ltr; unicode-bidi:isolate; font-variant-numeric:tabular-nums; }
  .amiri { font-family:Amiri, serif; }
  .muted { color:${T.muted}; }
  .rule { border-top:1px solid ${T.rule}; }
  .goldrule { height:1px; background:linear-gradient(90deg, transparent, ${T.gold} 20%, ${T.gold} 80%, transparent); }
  .panel { background:${T.paper}; border:1px solid ${T.rule}; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:10px; height:48px; padding:0 24px; font-size:14px; font-weight:500; border:1px solid ${T.ink}; background:${T.ink}; color:${T.ivory}; white-space:nowrap; }
  .btn-o { background:transparent; color:${T.ink}; }
  .btn-g { background:transparent; color:${T.ink}; border-color:transparent; text-decoration:underline; text-underline-offset:4px; text-decoration-color:${T.gold}; padding:0 4px; }
  .btn-sm { height:40px; padding:0 18px; font-size:13px; }
  .btn-xl { height:56px; padding:0 32px; font-size:15px; }
  .btn-d { border-color:${T.carn}; background:${T.carn}; color:#fff; }
  .field { display:flex; flex-direction:column; gap:8px; }
  .field label { font-size:13px; font-weight:500; color:${T.ink80}; }
  .field .hint { font-size:12px; color:${T.muted}; }
  .input { height:48px; border:1px solid ${T.rule}; background:#fff; padding:0 14px; font-size:15px; display:flex; align-items:center; color:${T.ink}; }
  .input.ro { background:${T.sandSoft}; color:${T.ink60}; }
  .input.focus { border-color:${T.gold}; box-shadow:0 0 0 2px ${T.goldSoft}; }
  .input.err { border-color:${T.carn}; }
  .err-line { font-size:12.5px; color:${T.carn}; }
  .tag { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; font-size:12px; font-weight:500; border:1px solid ${T.rule}; color:${T.ink80}; }
  .tag-gold { border-color:${T.gold}; color:${T.gold}; }
  .tag-amber { border-color:transparent; background:${T.amberSoft}; color:${T.amber}; }
  .pill { display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:500; }
  .pill i { width:7px; height:7px; border-radius:999px; display:inline-block; }
  .chip { display:inline-flex; align-items:center; height:36px; padding:0 16px; font-size:13.5px; border:1px solid ${T.rule}; color:${T.ink80}; background:transparent; position:relative; }
  .chip.on { border-color:${T.ink}; color:${T.ink}; font-weight:500; }
  .chip.on::after { content:""; position:absolute; inset-inline:12px; bottom:3px; height:1px; background:${T.gold}; }
  .rail a { display:flex; align-items:center; gap:12px; padding:10px 0; font-size:15px; color:${T.ink80}; position:relative; }
  .rail a.on { color:${T.ink}; font-weight:500; }
  .rail a.on::before { content:""; position:absolute; inset-inline-start:-24px; top:12px; bottom:12px; width:2px; background:${T.gold}; }
  .rail svg { color:${T.ink60}; } .rail a.on svg { color:${T.ink}; }
  .thumb { width:64px; height:80px; background:${T.sand}; flex:none; display:flex; align-items:flex-end; justify-content:center; font-size:9px; color:${T.ink60}; padding-bottom:4px; }
  .sk { background:linear-gradient(90deg, ${T.sandSoft} 25%, #fff 50%, ${T.sandSoft} 75%); background-size:200% 100%; }
  .toast { display:flex; align-items:center; gap:12px; background:${T.ink}; color:${T.ivory}; padding:14px 18px; font-size:14px; border-inline-start:3px solid ${T.gold}; box-shadow:0 12px 32px -12px rgba(21,26,53,.45); }
  .steps { display:flex; align-items:center; gap:0; }
  .step { display:flex; flex-direction:column; align-items:center; gap:8px; flex:1; position:relative; font-size:12px; color:${T.muted}; }
  .step i { width:10px; height:10px; border-radius:999px; border:1.5px solid ${T.rule}; background:${T.paper}; z-index:1; }
  .step.done i { background:${T.gold}; border-color:${T.gold}; }
  .step.now i { background:${T.ink}; border-color:${T.ink}; box-shadow:0 0 0 4px ${T.goldSoft}; }
  .step.done, .step.now { color:${T.ink}; }
  .step.now { font-weight:500; }
  .step::before { content:""; position:absolute; top:4.5px; inset-inline-start:50%; width:100%; height:1px; background:${T.rule}; }
  .step:last-child::before { display:none; }
  .step.done::before { background:${T.gold}; }
  .kv { display:flex; justify-content:space-between; gap:12px; font-size:14px; padding:6px 0; }
  .kv b { font-weight:500; }
`;

// ---- icons (hand-drawn 21-grid, stroke 1.3 — the navbar's own language) ----
const ic = (paths, s = 21, sw = 1.3) => `<svg width="${s}" height="${s}" viewBox="0 0 21 21" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const I = {
  menu: (s) => ic('<path d="M3.6 6.4h13.8M3.6 10.5h13.8M3.6 14.6h13.8"/>', s),
  heart: (s) => ic('<path d="M10.5 17.6C6.2 14.5 3.2 12 3.2 8.8 3.2 6.6 4.9 5 7 5c1.4 0 2.7.8 3.5 2 .8-1.2 2.1-2 3.5-2 2.1 0 3.8 1.6 3.8 3.8 0 3.2-3 5.7-7.3 8.8z"/>', s),
  bag: (s) => ic('<path d="M4.8 6.6h11.4l-.9 10.8H5.7z"/><path d="M8 6.6V5.2a2.5 2.5 0 0 1 5 0v1.4"/>', s),
  user: (s) => ic('<circle cx="10.5" cy="7.6" r="3.1"/><path d="M4.8 17.4c0-3 2.6-4.8 5.7-4.8s5.7 1.8 5.7 4.8"/>', s),
  search: (s) => ic('<circle cx="9.5" cy="9.5" r="5.5"/><path d="M17.5 17.5l-4.1-4.1"/>', s),
  x: (s) => ic('<path d="M5.5 5.5l10 10M15.5 5.5l-10 10"/>', s),
  chevD: (s) => ic('<path d="M6 8.5l4.5 4.5L15 8.5"/>', s),
  chevU: (s) => ic('<path d="M6 12.5l4.5-4.5L15 12.5"/>', s),
  chevL: (s) => ic('<path d="M12.5 5.5L7.5 10.5l5 5"/>', s),
  arrL: (s) => ic('<path d="M17 10.5H4M9.5 5l-5.5 5.5 5.5 5.5"/>', s),
  pkg: (s) => ic('<path d="M3.5 7l7-3.5 7 3.5v7l-7 3.5-7-3.5z"/><path d="M3.5 7l7 3.5 7-3.5M10.5 10.5v7"/>', s),
  pin: (s) => ic('<path d="M10.5 18s-5.5-5-5.5-9a5.5 5.5 0 0 1 11 0c0 4-5.5 9-5.5 9z"/><circle cx="10.5" cy="9" r="2"/>', s),
  out: (s) => ic('<path d="M8 17.5H4.5v-14H8"/><path d="M13 14l3.5-3.5L13 7M16.5 10.5H8"/>', s),
  phone: (s) => ic('<path d="M6.5 3.5h3l1.5 3.5-2 1.2a8 8 0 0 0 3.8 3.8l1.2-2 3.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5A12.5 12.5 0 0 1 5 5a1.5 1.5 0 0 1 1.5-1.5z"/>', s),
  chat: (s) => ic('<path d="M4 15.5l1-3A6.5 6.5 0 1 1 7.5 15z"/>', s),
  fb: (s) => ic('<path d="M12.5 3.5h-2a3 3 0 0 0-3 3v2H5.5v3h2v6h3v-6h2.2l.5-3H10.5v-1.5a.5.5 0 0 1 .5-.5h1.5z"/>', s),
  pencil: (s) => ic('<path d="M4 17l1-4L14.5 3.5l3 3L8 16z"/><path d="M12.5 5.5l3 3"/>', s),
  trash: (s) => ic('<path d="M4.5 6h12M8 6V4.5h5V6M6 6l.7 11h7.6L15 6"/>', s),
  star: (s) => ic('<path d="M10.5 3.5l2.1 4.4 4.9.6-3.6 3.4.9 4.8-4.3-2.4-4.3 2.4.9-4.8-3.6-3.4 4.9-.6z"/>', s),
  check: (s) => ic('<path d="M4.5 11l4 4 8-8.5"/>', s),
  lock: (s) => ic('<rect x="5" y="9" width="11" height="8.5"/><path d="M7.5 9V6.5a3 3 0 0 1 6 0V9"/>', s),
  alert: (s) => ic('<path d="M10.5 3.5l7.5 13h-15z"/><path d="M10.5 8.5v4M10.5 14.5h.01"/>', s),
  plus: (s) => ic('<path d="M10.5 4.5v12M4.5 10.5h12"/>', s),
  refresh: (s) => ic('<path d="M16.5 10.5a6 6 0 1 1-1.8-4.3"/><path d="M16.5 3.5v3.5H13"/>', s),
  eye: (s) => ic('<path d="M2.5 10.5S5.5 5.5 10.5 5.5s8 5 8 5-3 5-8 5-8-5-8-5z"/><circle cx="10.5" cy="10.5" r="2.2"/>', s),
  mail: (s) => ic('<rect x="3" y="5.5" width="15" height="10"/><path d="M3 6.5l7.5 5.5L18 6.5"/>', s),
  crown: (s) => ic('<path d="M3.5 15.5h14M3.5 15.5l-.5-8 4.5 3 3-5 3 5 4.5-3-.5 8"/>', s),
};

const logo = (h = 72) => `<img src="logo-lapis.png" alt="قطن ملوك النيل" style="height:${h}px; width:auto; display:block;">`;
const control = (svg, opts = {}) => `<span style="position:relative; display:grid; place-items:center; width:44px; height:44px; color:${opts.on ? T.ink : T.ink80};">${svg}${opts.badge ? `<span class="num" style="position:absolute; top:2px; inset-inline-end:2px; min-width:18px; height:18px; padding:0 5px; border-radius:999px; background:${T.ink}; color:${T.ivory}; font-size:10px; font-weight:600; display:grid; place-items:center;">${opts.badge}</span>` : ""}${opts.on ? `<span style="position:absolute; inset-inline:11px; bottom:3px; height:1px; background:${T.gold};"></span>` : ""}</span>`;

// ---- the navbar (desktop 84px) ----
function navbarDesktop({ current = "", accountOpen = false, loggedIn = true } = {}) {
  return `
<header style="position:relative; height:84px; background:${T.ivory}; border-bottom:1px solid ${T.rule}; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; padding:0 32px;">
  <div style="display:flex; align-items:center; justify-self:start;">
    <span style="display:inline-flex; align-items:center; gap:10px; height:44px; padding:0 10px 0 6px; color:${T.ink80};">${I.menu(22)}<span style="font-size:13.5px;">القائمة</span></span>
    <span style="display:flex; align-items:center; gap:8px; height:40px; padding:0 4px 0 14px; margin-inline-start:14px; border-bottom:1px solid ${T.rule}; color:${T.muted}; font-size:13.5px; min-width:220px;">${I.search(18)}<span>ابحث عن منتج…</span></span>
  </div>
  <a href="#" aria-label="قطن ملوك النيل" style="justify-self:center;">${logo(72)}</a>
  <div style="display:flex; align-items:center; gap:2px; justify-self:end;">
    ${control(I.heart(22))}
    ${control(I.bag(22), { badge: 3, on: current === "cart" })}
    ${loggedIn
      ? `<a href="#" style="display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 6px 0 12px; ${current === "account" ? `color:${T.ink};` : `color:${T.ink80};`} position:relative;">${I.user(22)}<span style="font-size:13.5px; font-weight:500;">أهلًا، عمر</span>${I.chevD(14)}${current === "account" ? `<span style="position:absolute; inset-inline:12px; bottom:3px; height:1px; background:${T.gold};"></span>` : ""}</a>`
      : `<a href="#" style="display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 8px; color:${T.ink80};">${I.user(22)}<span style="font-size:13.5px;">تسجيل الدخول</span></a>`}
  </div>
  ${accountOpen ? `
  <div role="menu" style="position:absolute; top:76px; inset-inline-end:32px; width:280px; background:${T.paper}; border:1px solid ${T.rule}; box-shadow:0 24px 48px -24px rgba(21,26,53,.35); z-index:5;">
    <div style="padding:18px 20px 16px; border-bottom:1px solid ${T.ruleSoft}; display:flex; align-items:center; gap:12px;">
      <span class="amiri" style="width:40px; height:40px; border:1px solid ${T.gold}; border-radius:999px; display:grid; place-items:center; font-size:20px; color:${T.ink};">ع</span>
      <span style="display:flex; flex-direction:column;"><b style="font-weight:500; font-size:14.5px;">عمر عبد العزيز</b><span class="num muted" style="font-size:12.5px;">+20 100 234 5678</span></span>
    </div>
    <div style="padding:8px 0; display:flex; flex-direction:column;">
      ${[[I.pkg(18), "طلباتي", "طلبان جاريان"], [I.pin(18), "عناويني", ""], [I.user(18), "حسابي", ""]].map(([s, l, sub]) => `<a href="#" style="display:flex; align-items:center; gap:12px; padding:11px 20px; font-size:14.5px; color:${T.ink};">${s}<span style="flex:1;">${l}</span>${sub ? `<span class="muted" style="font-size:12px;">${sub}</span>` : ""}</a>`).join("")}
    </div>
    <div style="padding:8px 0; border-top:1px solid ${T.ruleSoft};">
      <a href="#" style="display:flex; align-items:center; gap:12px; padding:11px 20px; font-size:14.5px; color:${T.ink80};">${I.out(18)}تسجيل الخروج</a>
    </div>
  </div>` : ""}
</header>
<div class="goldrule"></div>`;
}

// ---- the drawer panel body (shared by the desktop-open state and the phone artboards) ----
function drawerPanel({ loggedIn = true, width = 420, compact = false } = {}) {
  const sections = ["كولكشن رجالي", "كولكشن حريمي", "كولكشن أطفال"];
  const px = compact ? 20 : 24;
  return `
  <div role="dialog" aria-label="القائمة" style="position:absolute; top:0; bottom:0; inset-inline-start:0; width:${width}px; background:${T.ivory}; box-shadow:24px 0 48px -24px rgba(21,26,53,.5); display:flex; flex-direction:column;">
    <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 8px 10px 16px; border-bottom:1px solid ${T.rule};">${logo(40)}<span style="width:44px; height:44px; display:grid; place-items:center; color:${T.ink80};">${I.x(22)}</span></div>
    <div style="flex:1; overflow:auto;">
      ${loggedIn ? `
      <a href="#" style="display:flex; align-items:center; gap:12px; padding:16px ${px}px; border-bottom:1px solid ${T.rule}; background:${T.paper};">
        <span class="amiri" style="width:40px; height:40px; border:1px solid ${T.gold}; border-radius:999px; display:grid; place-items:center; font-size:20px;">ع</span>
        <span style="flex:1; display:flex; flex-direction:column;"><b style="font-weight:500; font-size:14.5px;">أهلًا، عمر</b><span class="muted" style="font-size:12.5px;">طلبان جاريان · <span class="num">2</span> عناوين</span></span>
        ${I.chevL(18)}
      </a>` : `
      <div style="display:flex; gap:10px; padding:16px ${px}px; border-bottom:1px solid ${T.rule};">
        <a href="#" class="btn btn-sm" style="flex:1;">تسجيل الدخول</a>
        <a href="#" class="btn btn-o btn-sm" style="flex:1;">حساب جديد</a>
      </div>`}
      ${compact ? `<div style="padding:16px ${px}px 0;"><span style="display:flex; align-items:center; gap:8px; height:44px; padding:0 14px; border:1px solid ${T.rule}; color:${T.muted}; font-size:13.5px;">${I.search(18)}ابحث عن منتج…</span></div>` : ""}
      <nav aria-label="تصنيفات المتجر" style="padding:0 ${px}px;">
        ${sections.map((s, i) => `
        <div style="border-bottom:1px solid ${T.rule};">
          <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 0;"><span class="amiri" style="font-size:20px; ${i === 1 ? "font-weight:700;" : ""}">${s}</span>${i === 1 ? I.chevU(18) : I.chevD(18)}</div>
          ${i === 1 ? `<div style="display:flex; flex-direction:column; gap:2px; padding:0 0 12px 0;">${["الكل", "الأكثر مبيعًا", "وصل حديثًا", "بيجامات"].map((c, j) => `<a href="#" style="padding:8px 12px 8px 0; font-size:15px; color:${j === 0 ? T.ink : T.ink80}; border-inline-start:1px solid ${j === 0 ? T.gold : "transparent"};">${c}</a>`).join("")}</div>` : ""}
        </div>`).join("")}
        <a href="#" style="display:flex; align-items:center; justify-content:space-between; padding:16px 0; border-bottom:1px solid ${T.rule};"><span class="amiri" style="font-size:20px;">الأكثر مبيعًا</span>${I.chevL(18)}</a>
      </nav>
      ${loggedIn ? `
      <div style="padding:8px ${px}px 0;">
        ${[[I.pkg(18), "طلباتي"], [I.pin(18), "عناويني"], [I.user(18), "حسابي"]].map(([s, l]) => `<a href="#" style="display:flex; align-items:center; gap:12px; padding:12px 0; font-size:15px; color:${T.ink};">${s}${l}</a>`).join("")}
      </div>` : ""}
      <div style="margin:12px ${px}px 0; padding-top:12px; border-top:1px solid ${T.rule}; display:flex; flex-direction:column;">
        ${[[I.chat(18), "تواصل معنا على واتساب"], [I.phone(18), "خدمة العملاء"], [I.fb(18), "تابعنا على فيسبوك"]].map(([s, l]) => `<a href="#" style="display:flex; align-items:center; gap:12px; padding:10px 0; font-size:14px; color:${T.ink80};">${s}${l}</a>`).join("")}
      </div>
      <div style="margin:16px ${px}px 24px; padding:16px; background:${T.paper}; border:1px solid ${T.rule};">
        <p style="margin:0 0 4px; font-size:14px; font-weight:500;">كن شريكًا لملوك النيل</p>
        <p class="muted" style="margin:0 0 12px; font-size:12.5px;">وكيل أو موزع أونلاين — سجّل طلبك في دقيقة.</p>
        <div style="display:flex; gap:8px;"><a href="#" class="btn btn-o btn-sm" style="flex:1;">وكيل</a><a href="#" class="btn btn-o btn-sm" style="flex:1;">موزع</a></div>
      </div>
      ${loggedIn ? `<a href="#" style="display:flex; align-items:center; gap:12px; margin:0 ${px}px 28px; font-size:14px; color:${T.ink60};">${I.out(18)}تسجيل الخروج</a>` : ""}
    </div>
  </div>`;
}

// ---- desktop: the drawer open over the dimmed page ----
function desktopDrawerOpen() {
  return `
<div style="position:relative; height:1000px; overflow:hidden; background:${T.ivory};">
  <div style="opacity:.55;">${navbarDesktop({ current: "account" })}</div>
  <div style="position:absolute; inset:0; background:rgba(21,26,53,.45);"></div>
  ${drawerPanel({ loggedIn: true, width: 420 })}
</div>`;
}

// ---- mobile navbar (60px) ----
function navbarMobile({ current = "" } = {}) {
  return `
<header style="height:60px; background:${T.ivory}; border-bottom:1px solid ${T.rule}; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; padding:0 6px;">
  <span style="justify-self:start; display:flex;">${control(I.menu(22))}${control(I.search(20))}</span>
  <a href="#">${logo(46)}</a>
  <span style="justify-self:end; display:flex;">${control(I.bag(22), { badge: 3, on: current === "cart" })}${control(I.user(22), { on: current === "account" })}</span>
</header>
<div class="goldrule"></div>`;
}

// ---- account shell (desktop) ----
function identityStrip({ compact = false } = {}) {
  return `
<div style="display:flex; align-items:center; gap:${compact ? 14 : 20}px;">
  <span class="amiri" style="width:${compact ? 52 : 64}px; height:${compact ? 52 : 64}px; border:1px solid ${T.gold}; border-radius:999px; display:grid; place-items:center; font-size:${compact ? 24 : 30}px; color:${T.ink}; flex:none;">ع</span>
  <div style="display:flex; flex-direction:column; gap:2px; min-width:0;">
    <h1 style="font-size:${compact ? 28 : 38}px;">عمر عبد العزيز</h1>
    <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px 14px; font-size:13.5px; color:${T.ink60};">
      <span class="num">+20 100 234 5678</span>
      <span aria-hidden="true">·</span>
      <span>عميل منذ <span class="num">2024</span></span>
      <span aria-hidden="true">·</span>
      <span><span class="num">7</span> طلبات</span>
    </div>
  </div>
</div>`;
}

const railItems = [
  ["orders", I.pkg(20), "طلباتي"],
  ["addresses", I.pin(20), "عناويني"],
  ["account", I.user(20), "حسابي"],
];
function rail(active) {
  return `
<nav class="rail" aria-label="أقسام حسابي" style="display:flex; flex-direction:column; gap:2px; padding-inline-start:24px; border-inline-start:1px solid ${T.rule};">
  ${railItems.map(([k, s, l]) => `<a href="#" class="${k === active ? "on" : ""}">${s}${l}</a>`).join("")}
  <div style="height:1px; background:${T.ruleSoft}; margin:12px 0;"></div>
  <a href="#" style="color:${T.ink60};">${I.out(20)}تسجيل الخروج</a>
</nav>`;
}
function mobileTabs(active) {
  return `
<nav aria-label="أقسام حسابي" style="display:flex; border-bottom:1px solid ${T.rule}; margin:0 -20px; padding:0 20px;">
  ${railItems.map(([k, s, l]) => `<a href="#" style="flex:1; display:flex; align-items:center; justify-content:center; gap:8px; height:48px; font-size:14px; position:relative; ${k === active ? `color:${T.ink}; font-weight:500;` : `color:${T.ink60};`}">${s}${l}${k === active ? `<span style="position:absolute; inset-inline:8px; bottom:-1px; height:2px; background:${T.gold};"></span>` : ""}</a>`).join("")}
</nav>`;
}

function shell(active, body, { h = 1100 } = {}) {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><script src="./support.js"></script></head><body>
<x-dc><helmet>${FONTS}<style>${CSS}</style></helmet>
<div dir="rtl" style="width:1440px; min-height:${h}px; background:${T.ivory};">
  ${navbarDesktop({ current: "account" })}
  <div style="max-width:1200px; margin:0 auto; padding:44px 40px 72px;">
    ${identityStrip()}
    <div style="margin-top:28px; border-top:1px solid ${T.rule}; padding-top:36px; display:grid; grid-template-columns:200px minmax(0,1fr); gap:56px; align-items:start;">
      ${rail(active)}
      <main style="min-width:0;">${body}</main>
    </div>
  </div>
</div>
</x-dc></body></html>`;
}
function mobileShell(active, body, { h = 1500, nav = true } = {}) {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><script src="./support.js"></script></head><body>
<x-dc><helmet>${FONTS}<style>${CSS}</style></helmet>
<div dir="rtl" style="width:390px; min-height:${h}px; background:${T.ivory};">
  ${navbarMobile({ current: "account" })}
  <div style="padding:24px 20px 48px;">
    ${nav ? identityStrip({ compact: true }) : ""}
    ${nav ? `<div style="margin-top:20px;">${mobileTabs(active)}</div>` : ""}
    <main style="margin-top:24px;">${body}</main>
  </div>
</div>
</x-dc></body></html>`;
}
const sectionH = (t, sub = "", action = "") => `
<div style="display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:20px;">
  <div><h2 style="font-size:26px;">${t}</h2>${sub ? `<p class="muted" style="margin:4px 0 0; font-size:13.5px;">${sub}</p>` : ""}</div>
  ${action}
</div>`;

// ---- sample data ----
const STATUS = {
  CREATED: ["قيد الإنشاء", T.muted],
  CONFIRMED: ["مؤكد", "#3B6EA5"],
  PROCESSING: ["قيد التجهيز", T.gold],
  READY_TO_SHIP: ["جاهز للشحن", "#6B4FA5"],
  SHIPPED: ["تم الشحن", "#6B4FA5"],
  DELIVERED: ["تم التسليم", T.malachite],
  CANCELLED: ["ملغي", T.carn],
};
const pill = (k) => `<span class="pill" style="color:${STATUS[k][1]};"><i style="background:${STATUS[k][1]};"></i>${STATUS[k][0]}</span>`;
const STEPS = ["CREATED", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
const stepLabels = { CREATED: "تم الاستلام", CONFIRMED: "مؤكد", PROCESSING: "قيد التجهيز", SHIPPED: "تم الشحن", DELIVERED: "تم التسليم" };
function stepper(status, { compact = false } = {}) {
  const idx = status === "READY_TO_SHIP" ? 2 : STEPS.indexOf(status);
  return `<div class="steps" style="${compact ? "font-size:11px;" : ""}">${STEPS.map((s, i) => `<div class="step ${i < idx ? "done" : i === idx ? "now" : ""}"><i></i><span>${stepLabels[s]}</span></div>`).join("")}</div>`;
}
const ORDERS = [
  { id: "K7M2P9QX", date: "13 سبتمبر 2026", status: "SHIPPED", total: 1430, pay: "الدفع عند الاستلام", ticket: "ANSWERED", items: [["تيشيرت قطن جيزة 100%", "أبيض · L", 1, 650], ["تيشرت أطفال مطبوع", "مطبوع · 6–7 سنوات", 2, 780]], addr: "القاهرة، مدينة نصر، الحي السابع — 12 ش عباس العقاد، الدور 3", sub: 1430, disc: 0, ship: 0 },
  { id: "H3T8R1LC", date: "6 سبتمبر 2026", status: "PROCESSING", total: 1245, pay: "الدفع عبر InstaPay", items: [["بيجامة قطن رجالي", "كحلي · XL", 1, 1190]], addr: "القاهرة، مدينة نصر، الحي السابع — 12 ش عباس العقاد", sub: 1190, disc: 0, ship: 55 },
  { id: "B9W4N6ZD", date: "22 أغسطس 2026", status: "DELIVERED", total: 2030, pay: "الدفع عند الاستلام", items: [["قميص بولو بيكيه", "زيتي · M", 1, 890], ["قميص بولو بيكيه", "أبيض · M", 1, 890]], addr: "الجيزة، الشيخ زايد، الحي الرابع — فيلا 18", sub: 1780, disc: 0, ship: 250 },
  { id: "F2Q5V7MA", date: "3 أغسطس 2026", status: "CANCELLED", total: 780, pay: "الدفع عند الاستلام", items: [["تيشرت أطفال مطبوع", "مطبوع · 4–5 سنوات", 2, 780]], addr: "القاهرة، مدينة نصر", sub: 780, disc: 0, ship: 0 },
];
const money = (n) => `<span class="num">${n.toLocaleString("en-US")}</span> ج.م`;

function orderCard(o, { expanded = false, compact = false } = {}) {
  const shown = o.items.slice(0, 3);
  return `
<article class="panel" style="padding:${compact ? "18px 18px 16px" : "24px 28px"}; display:flex; flex-direction:column; gap:${compact ? 16 : 20}px;">
  <header style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
      <span class="num" style="font-size:15px; font-weight:600; letter-spacing:.02em;">#${o.id}</span>
      <span class="muted" style="font-size:13px;">${o.date}</span>
    </div>
    ${pill(o.status)}
  </header>
  ${o.status === "CANCELLED"
    ? `<p style="margin:0; font-size:13.5px; color:${T.ink60}; padding:10px 14px; background:${T.carnSoft}; border-inline-start:2px solid ${T.carn};">أُلغي هذا الطلب بناءً على طلبك. لم يُخصم أي مبلغ.</p>`
    : stepper(o.status, { compact })}
  <div style="display:flex; align-items:center; gap:${compact ? 12 : 16}px; flex-wrap:wrap;">
    <div style="display:flex; gap:8px;">${shown.map(() => `<span class="thumb" style="${compact ? "width:52px;height:66px;" : ""}"></span>`).join("")}${o.items.length > 3 ? `<span class="thumb muted" style="align-items:center; font-size:12px;">+${o.items.length - 3}</span>` : ""}</div>
    <div style="flex:1; min-width:160px; display:flex; flex-direction:column; gap:2px; font-size:13.5px;">
      ${shown.map(([n, v, q]) => `<span><span style="color:${T.ink};">${n}</span> <span class="muted">— ${v} × <span class="num">${q}</span></span></span>`).join("")}
    </div>
    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
      <span class="amiri" style="font-size:${compact ? 22 : 26}px; font-weight:700;">${money(o.total)}</span>
      <span class="muted" style="font-size:12.5px;">${o.pay}</span>
    </div>
  </div>
  <footer style="display:flex; align-items:center; justify-content:space-between; gap:12px; border-top:1px solid ${T.ruleSoft}; padding-top:14px; flex-wrap:wrap;">
    <a href="#" class="btn btn-g" style="height:auto; font-size:13.5px; display:inline-flex; align-items:center; gap:6px;">${expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}${expanded ? I.chevU(14) : I.chevD(14)}</a>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      ${o.status === "DELIVERED" ? `<a href="#" class="btn btn-o btn-sm">${I.refresh(16)}إعادة الطلب</a>` : ""}
      ${["CREATED", "CONFIRMED"].includes(o.status) ? `<a href="#" class="btn btn-o btn-sm" style="border-color:${T.carn}; color:${T.carn};">إلغاء الطلب</a>` : ""}
      ${o.ticket ? `<a href="#" class="btn btn-o btn-sm" style="border-color:${T.gold};">${I.chat(16)}سؤالك · ${TICKET_STATUS[o.ticket][0]}</a>` : `<a href="#" class="btn btn-o btn-sm">${I.chat(16)}سؤال عن الطلب</a>`}
    </div>
  </footer>
  ${expanded ? `
  <div style="border-top:1px solid ${T.ruleSoft}; padding-top:20px; display:grid; grid-template-columns:${compact ? "1fr" : "minmax(0,1fr) 300px"}; gap:28px;">
    <div style="display:flex; flex-direction:column; gap:14px;">
      <p style="margin:0; font-size:12px; letter-spacing:.06em; color:${T.muted};">الأصناف</p>
      ${o.items.map(([n, v, q, p]) => `<div style="display:flex; align-items:center; gap:14px;"><span class="thumb" style="width:48px; height:60px;"></span><span style="flex:1; display:flex; flex-direction:column;"><span style="font-size:14px;">${n}</span><span class="muted" style="font-size:12.5px;">${v} × <span class="num">${q}</span></span></span><span style="font-size:14px;">${money(p)}</span></div>`).join("")}
      <p style="margin:10px 0 0; font-size:12px; letter-spacing:.06em; color:${T.muted};">عنوان التوصيل</p>
      <p style="margin:0; font-size:14px;">${o.addr}<br><span class="num muted" style="font-size:13px;">+20 100 234 5678</span></p>
    </div>
    <div style="background:${T.ivory}; padding:18px 20px; align-self:start;">
      <div class="kv"><span class="muted">المجموع الفرعي</span><b>${money(o.sub)}</b></div>
      ${o.disc ? `<div class="kv"><span class="muted">الخصم</span><b style="color:${T.malachite};">− ${money(o.disc)}</b></div>` : ""}
      <div class="kv"><span class="muted">رسوم الشحن</span><b>${o.ship ? money(o.ship) : "مجانًا"}</b></div>
      <div class="kv" style="border-top:1px solid ${T.rule}; margin-top:8px; padding-top:12px;"><span>الإجمالي</span><b class="amiri" style="font-size:22px;">${money(o.total)}</b></div>
      <p class="muted" style="margin:10px 0 0; font-size:12px;">${o.pay}</p>
    </div>
  </div>` : ""}
</article>`;
}

// ---- address data ----
const ADDR = [
  { label: "المنزل", def: true, gov: "القاهرة", city: "مدينة نصر", area: "الحي السابع", street: "12 ش عباس العقاد، الدور 3، شقة 9", phone: "+20 100 234 5678", notes: "الاتصال قبل الوصول" },
  { label: "العمل", def: false, gov: "القاهرة", city: "التجمع الخامس", area: "التسعين الشمالي", street: "برج كايرو بيزنس، الدور 6", phone: "+20 122 987 6543", notes: "" },
  { label: "", def: false, gov: "الجيزة", city: "", area: "الشيخ زايد", street: "الحي الرابع، فيلا 18", phone: "+20 100 234 5678", notes: "", incomplete: true },
];
function addressCard(a, { compact = false } = {}) {
  return `
<article class="panel" style="padding:${compact ? "18px" : "22px 24px"}; display:flex; flex-direction:column; gap:14px; ${a.def ? `border-color:${T.ink};` : ""} ${a.incomplete ? `border-style:dashed;` : ""}">
  <header style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
    <div style="display:flex; align-items:center; gap:10px;">
      <span style="font-size:16px; font-weight:500;">${a.label || "عنوان بدون تسمية"}</span>
      ${a.def ? `<span class="tag tag-gold">${I.star(12)}الافتراضي</span>` : ""}
      ${a.incomplete ? `<span class="tag tag-amber">${I.alert(12)}يحتاج المدينة</span>` : ""}
    </div>
    <span style="display:flex; gap:2px;">
      <a href="#" aria-label="تعديل" style="width:36px; height:36px; display:grid; place-items:center; color:${T.ink80};">${I.pencil(18)}</a>
      <a href="#" aria-label="حذف" style="width:36px; height:36px; display:grid; place-items:center; color:${T.carn};">${I.trash(18)}</a>
    </span>
  </header>
  <p style="margin:0; font-size:14.5px; line-height:1.7;">${[a.gov, a.city, a.area].filter(Boolean).join("، ")}<br>${a.street}</p>
  <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
    <span class="num" style="font-size:13.5px; color:${T.ink60};">${a.phone}</span>
    ${a.notes ? `<span class="muted" style="font-size:12.5px;">${a.notes}</span>` : ""}
  </div>
  ${a.incomplete
    ? `<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; border-top:1px solid ${T.ruleSoft}; padding-top:12px;"><span style="font-size:13px; color:${T.amber};">أضف المدينة حتى يمكن استخدام هذا العنوان عند الدفع.</span><a href="#" class="btn btn-sm">أكمل العنوان</a></div>`
    : a.def ? "" : `<div style="border-top:1px solid ${T.ruleSoft}; padding-top:12px;"><a href="#" class="btn btn-g" style="height:auto; font-size:13.5px;">تعيين كعنوان افتراضي</a></div>`}
</article>`;
}

// ---- forms ----
const field = (label, value, { ro = false, ltr = false, hint = "", focus = false, err = "", type = "input", span = false, icon = "" } = {}) => `
<div class="field" style="${span ? "grid-column:1/-1;" : ""}">
  <label>${label}</label>
  ${type === "select"
    ? `<span class="input" style="justify-content:space-between;"><span>${value}</span>${I.chevD(16)}</span>`
    : type === "textarea"
      ? `<span class="input" style="height:88px; align-items:flex-start; padding-top:12px; ${value ? "" : `color:${T.muted};`}">${value || "مثال: الاتصال قبل الوصول"}</span>`
      : `<span class="input ${ro ? "ro" : ""} ${focus ? "focus" : ""} ${err ? "err" : ""} ${ltr ? "num" : ""}" style="${ltr ? "direction:ltr; justify-content:flex-start;" : ""} ${value ? "" : `color:${T.muted};`} gap:10px;">${icon}${value || "—"}</span>`}
  ${err ? `<span class="err-line">${err}</span>` : hint ? `<span class="hint">${hint}</span>` : ""}
</div>`;

const accountBody = (compact = false) => `
${sectionH("حسابي", "الاسم والبريد قابلان للتعديل. رقم الجوال هو هوية حسابك ولا يتغير من هنا.")}
<div class="panel" style="padding:${compact ? "22px 18px" : "32px"};">
  <div style="display:grid; grid-template-columns:${compact ? "1fr" : "1fr 1fr"}; gap:20px 24px;">
    ${field("الاسم", "عمر عبد العزيز")}
    ${field("البريد الإلكتروني (اختياري)", "omar@example.com", { ltr: true, icon: I.mail(16), hint: "نستخدمه لإشعارات الطلب فقط." })}
    ${field("رقم الجوال", "+20 100 234 5678", { ro: true, ltr: true, icon: I.lock(16), hint: "موثّق عبر واتساب. للتغيير تواصل مع خدمة العملاء.", span: compact })}
  </div>
  <div style="display:flex; align-items:center; gap:14px; margin-top:28px; padding-top:22px; border-top:1px solid ${T.ruleSoft};">
    <a href="#" class="btn">حفظ التعديلات</a>
    <span class="muted" style="font-size:13px;">آخر تحديث <span class="num">2</span> سبتمبر <span class="num">2026</span></span>
  </div>
</div>
<div style="margin-top:36px;">
  ${sectionH("كلمة المرور", "غيّر كلمة المرور من هنا. نسيتها؟ استخدم صفحة استعادة كلمة المرور بعد تسجيل الخروج.")}
  <div class="panel" style="padding:${compact ? "22px 18px" : "32px"};">
    <div style="display:grid; grid-template-columns:${compact ? "1fr" : "1fr 1fr"}; gap:20px 24px;">
      ${field("كلمة المرور الحالية", "••••••••••", { ltr: true, icon: I.eye(16), span: true })}
      ${field("كلمة المرور الجديدة", "••••••••••••", { ltr: true, icon: I.eye(16), hint: "8 أحرف على الأقل." })}
      ${field("تأكيد كلمة المرور الجديدة", "••••••••", { ltr: true, icon: I.eye(16), err: "كلمتا المرور غير متطابقتين." })}
    </div>
    <div style="margin-top:28px; padding-top:22px; border-top:1px solid ${T.ruleSoft};">
      <a href="#" class="btn btn-o">تغيير كلمة المرور</a>
    </div>
  </div>
</div>
<div style="margin-top:36px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 24px; border:1px solid ${T.ruleSoft}; flex-wrap:wrap;">
  <div><p style="margin:0; font-size:15px; font-weight:500;">تسجيل الخروج من هذا الجهاز</p><p class="muted" style="margin:2px 0 0; font-size:13px;">سلة التسوق تبقى محفوظة في حسابك.</p></div>
  <a href="#" class="btn btn-o btn-sm">${I.out(16)}تسجيل الخروج</a>
</div>`;

const addressesBody = (compact = false) => `
${sectionH("عناويني", "العنوان الافتراضي يُختار تلقائيًا عند الدفع.", `<a href="#" class="btn ${compact ? "btn-sm" : ""}">${I.plus(16)}عنوان جديد</a>`)}
<div style="display:grid; grid-template-columns:${compact ? "1fr" : "1fr 1fr"}; gap:16px;">
  ${ADDR.map((a) => addressCard(a, { compact })).join("")}
</div>
<p class="muted" style="margin:24px 0 0; font-size:13px; display:flex; align-items:center; gap:8px;">${I.pin(16)}رسوم الشحن تُحسب حسب المحافظة. المدينة والمنطقة لعنوان المندوب فقط.</p>`;

const addressForm = (compact = false) => `
<div style="display:grid; grid-template-columns:${compact ? "1fr" : "1fr 1fr"}; gap:18px 20px;">
  ${field("تسمية (اختياري)", "المنزل", { hint: "مثل: المنزل، العمل" })}
  ${field("المحافظة", "القاهرة", { type: "select" })}
  ${field("المدينة", "مدينة نصر", { focus: true })}
  ${field("المنطقة", "الحي السابع")}
  ${field("العنوان بالتفصيل", "12 ش عباس العقاد، الدور 3، شقة 9", { span: true, hint: "الشارع ورقم المبنى والدور والشقة." })}
  ${field("هاتف التوصيل", "+20 100 234 5678", { ltr: true, icon: I.phone(16), hint: "يمكن أن يختلف عن رقم الحساب — هذا رقم من يستلم الطلب." })}
  ${field("ملاحظات (اختياري)", "", { type: "textarea" })}
  <label style="grid-column:1/-1; display:flex; align-items:center; gap:10px; font-size:14px; cursor:pointer;"><span style="width:18px; height:18px; border:1px solid ${T.ink}; display:grid; place-items:center; background:${T.ink}; color:${T.ivory};">${I.check(12)}</span>اجعله العنوان الافتراضي</label>
</div>
<div style="display:flex; gap:12px; margin-top:28px; padding-top:22px; border-top:1px solid ${T.ruleSoft};">
  <a href="#" class="btn" style="flex:${compact ? 1 : "none"};">حفظ العنوان</a>
  <a href="#" class="btn btn-o" style="flex:${compact ? 1 : "none"};">إلغاء</a>
</div>`;

const ordersFilters = (compact = false) => `
<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:20px;">
  <div style="display:flex; gap:8px; ${compact ? "overflow-x:auto; margin:0 -20px; padding:0 20px 4px;" : "flex-wrap:wrap;"}">
    <span class="chip on">الكل <span class="num muted" style="margin-inline-start:6px;">7</span></span>
    <span class="chip">جارية <span class="num muted" style="margin-inline-start:6px;">2</span></span>
    <span class="chip">تم التسليم</span>
    <span class="chip">ملغية</span>
  </div>
  ${compact ? "" : `<span style="display:flex; align-items:center; gap:8px; height:36px; padding:0 12px; border:1px solid ${T.rule}; color:${T.muted}; font-size:13px; min-width:220px;">${I.search(16)}ابحث برقم الطلب أو المنتج…</span>`}
</div>`;

const ordersBody = (compact = false) => `
${sectionH("طلباتي", "تتبّع طلباتك الجارية وراجع ما سبق.")}
${ordersFilters(compact)}
<div style="display:flex; flex-direction:column; gap:16px;">
  ${orderCard(ORDERS[0], { expanded: true, compact })}
  ${orderCard(ORDERS[1], { compact })}
  ${orderCard(ORDERS[2], { compact })}
  ${orderCard(ORDERS[3], { compact })}
</div>
<div style="display:flex; justify-content:center; margin-top:28px;">
  <a href="#" class="btn btn-o btn-sm">عرض طلبات أقدم</a>
</div>`;

// ---- drawer (mobile) ----
function drawer({ loggedIn = true } = {}) {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><script src="./support.js"></script></head><body>
<x-dc><helmet>${FONTS}<style>${CSS}</style></helmet>
<div dir="rtl" style="width:390px; min-height:1100px; background:rgba(21,26,53,.45); position:relative;">
  ${drawerPanel({ loggedIn, width: 338, compact: true })}
</div>
</x-dc></body></html>`;
}

// ---- order ticket ("سؤال عن الطلب" as an in-site ticket, not WhatsApp) ----
const TICKET_REASONS = ["تأخير في التوصيل", "تعديل العنوان أو الهاتف", "مشكلة في المنتج", "استبدال أو إرجاع", "سؤال آخر"];
function ticketDialog({ compact = false } = {}) {
  return `
<div role="dialog" aria-label="سؤال عن الطلب" style="background:${T.paper}; border:1px solid ${T.rule}; box-shadow:0 24px 48px -24px rgba(21,26,53,.4); padding:${compact ? "24px 20px" : "28px 32px"}; width:${compact ? "100%" : "560px"};">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
    <div><h2 style="font-size:24px;">سؤال عن الطلب <span class="num" style="font-family:Archivo, sans-serif; font-size:18px; font-weight:600;">#K7M2P9QX</span></h2><p class="muted" style="margin:4px 0 0; font-size:13px;">نرد خلال يوم عمل. ستجد الرد هنا تحت الطلب.</p></div>
    <span style="width:40px; height:40px; display:grid; place-items:center; color:${T.ink80}; flex:none;">${I.x(20)}</span>
  </div>
  <p style="margin:22px 0 10px; font-size:13px; font-weight:500; color:${T.ink80};">موضوع السؤال</p>
  <div role="radiogroup" style="display:flex; flex-wrap:wrap; gap:8px;">${TICKET_REASONS.map((r, i) => `<span class="chip ${i === 0 ? "on" : ""}">${r}</span>`).join("")}</div>
  <div class="field" style="margin-top:20px;"><label>رسالتك</label><span class="input focus" style="height:112px; align-items:flex-start; padding-top:12px; line-height:1.6;">الطلب متأخر عن الموعد المتوقع بيومين. هل يمكن معرفة موعد التوصيل الجديد؟</span><span class="hint">لا حاجة لكتابة رقم الطلب أو بياناتك — نراها مع الرسالة.</span></div>
  <div class="field" style="margin-top:16px;"><label>رقم للتواصل</label><span class="input num" style="direction:ltr; justify-content:flex-start; gap:10px;">${I.phone(16)}+20 100 234 5678</span></div>
  <div style="display:flex; gap:12px; margin-top:24px; padding-top:20px; border-top:1px solid ${T.ruleSoft};"><a href="#" class="btn" style="${compact ? "flex:1;" : ""}">إرسال السؤال</a><a href="#" class="btn btn-o" style="${compact ? "flex:1;" : ""}">إلغاء</a></div>
</div>`;
}
const TICKET_STATUS = { OPEN: ["بانتظار الرد", T.gold], ANSWERED: ["تم الرد", T.malachite], CLOSED: ["مغلقة", T.muted] };
const tpill = (k) => `<span class="pill" style="color:${TICKET_STATUS[k][1]};"><i style="background:${TICKET_STATUS[k][1]};"></i>${TICKET_STATUS[k][0]}</span>`;
function ticketThread({ compact = false } = {}) {
  const msg = (who, when, text, mine) => `
  <div style="display:flex; flex-direction:column; gap:6px; align-items:${mine ? "flex-start" : "flex-end"};">
    <span class="muted" style="font-size:12px;">${who} · ${when}</span>
    <p style="margin:0; max-width:${compact ? "100%" : "78%"}; padding:12px 16px; font-size:14px; line-height:1.7; ${mine ? `background:${T.ivory}; border:1px solid ${T.ruleSoft};` : `background:${T.paper}; border:1px solid ${T.rule}; border-inline-end:2px solid ${T.gold};`}">${text}</p>
  </div>`;
  return `
<section class="panel" style="padding:${compact ? "18px" : "24px 28px"}; display:flex; flex-direction:column; gap:18px;">
  <header style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;"><h3 style="font-size:20px;">سؤالك عن الطلب</h3><span class="tag">تأخير في التوصيل</span></div>
    ${tpill("ANSWERED")}
  </header>
  <div style="display:flex; flex-direction:column; gap:14px;">
    ${msg("أنت", "أمس 14:20", "الطلب متأخر عن الموعد المتوقع بيومين. هل يمكن معرفة موعد التوصيل الجديد؟", true)}
    ${msg("خدمة عملاء ملوك النيل", "أمس 16:05", "أهلًا عمر، الشحنة مع المندوب وستصلك غدًا قبل الساعة 6 مساءً. نعتذر عن التأخير.", false)}
  </div>
  <div style="display:flex; gap:10px; align-items:flex-end; border-top:1px solid ${T.ruleSoft}; padding-top:16px; ${compact ? "flex-direction:column; align-items:stretch;" : ""}">
    <span class="input" style="flex:1; height:48px; color:${T.muted};">اكتب ردًا…</span>
    <a href="#" class="btn btn-sm" style="height:48px;">إرسال</a>
    <a href="#" class="btn btn-o btn-sm" style="height:48px;">إغلاق السؤال</a>
  </div>
</section>`;
}

// ---- artboards ----
const files = {};
const wrap = (w, h, body) => `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><script src="./support.js"></script></head><body>
<x-dc><helmet>${FONTS}<style>${CSS}</style></helmet>
<div dir="rtl" style="width:${w}px; min-height:${h}px; background:${T.sand}; display:flex; flex-direction:column; gap:40px; padding:0 0 40px;">${body}</div>
</x-dc></body></html>`;
const label = (t) => `<p style="margin:0 40px -28px; font-size:12px; letter-spacing:.08em; color:${T.ink60}; font-family:Archivo, sans-serif;">${t}</p>`;

// 1. Main — the navbar, four states
files["Main.dc.html"] = wrap(1440, 1780, `
${label("01 · NAVBAR — DEFAULT (LOGGED IN, ON /PROFILE)")}
<div style="background:${T.ivory};">${navbarDesktop({ current: "account" })}</div>
${label("02 · MENU OPEN — THE SAME DRAWER AS MOBILE; CATEGORIES LIVE HERE ON EVERY SCREEN")}
${desktopDrawerOpen()}
${label("03 · ACCOUNT MENU OPEN")}
<div style="background:${T.ivory}; height:360px; position:relative;">${navbarDesktop({ accountOpen: true, current: "account" })}</div>
${label("04 · LOGGED OUT")}
<div style="background:${T.ivory};">${navbarDesktop({ loggedIn: false })}</div>
`);

// 2. Mobile drawer
files["MobileDrawer.dc.html"] = drawer({ loggedIn: true });
files["MobileDrawerOut.dc.html"] = drawer({ loggedIn: false });

// 3–5. Desktop pages
files["Profile.dc.html"] = shell("account", accountBody(), { h: 1240 });
files["Addresses.dc.html"] = shell("addresses", addressesBody(), { h: 1000 });
files["Orders.dc.html"] = shell("orders", ordersBody(), { h: 1900 });

// 6. Address form — sheet over the addresses page
files["AddressForm.dc.html"] = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><script src="./support.js"></script></head><body>
<x-dc><helmet>${FONTS}<style>${CSS}</style></helmet>
<div dir="rtl" style="width:1440px; min-height:1000px; background:${T.ivory}; position:relative;">
  <div style="filter:blur(0); opacity:.55;">${navbarDesktop({ current: "account" })}
  <div style="max-width:1200px; margin:0 auto; padding:44px 40px 72px;">${identityStrip()}<div style="margin-top:28px; border-top:1px solid ${T.rule}; padding-top:36px; display:grid; grid-template-columns:200px minmax(0,1fr); gap:56px;">${rail("addresses")}<main>${addressesBody()}</main></div></div></div>
  <div style="position:absolute; inset:0; background:rgba(21,26,53,.35);"></div>
  <aside role="dialog" aria-label="عنوان جديد" style="position:absolute; top:0; bottom:0; inset-inline-start:0; width:560px; background:${T.ivory}; box-shadow:24px 0 48px -24px rgba(21,26,53,.5); display:flex; flex-direction:column;">
    <div style="display:flex; align-items:center; justify-content:space-between; padding:24px 32px; border-bottom:1px solid ${T.rule};">
      <div><h2 style="font-size:26px;">عنوان جديد</h2><p class="muted" style="margin:2px 0 0; font-size:13px;">الحقول المعلّمة مطلوبة لحساب الشحن والتوصيل.</p></div>
      <span style="width:44px; height:44px; display:grid; place-items:center; color:${T.ink80};">${I.x(22)}</span>
    </div>
    <div style="padding:28px 32px; overflow:auto;">${addressForm()}</div>
  </aside>
  <div style="position:absolute; top:100px; inset-inline-end:40px; width:520px;">
    <div style="background:${T.paper}; border:1px solid ${T.rule}; box-shadow:0 24px 48px -24px rgba(21,26,53,.4); padding:28px 32px;">
      <p style="margin:0 0 6px; font-size:12px; letter-spacing:.08em; color:${T.muted}; font-family:Archivo, sans-serif;">DELETE CONFIRMATION (STYLED DIALOG, REPLACES window.confirm)</p>
      <h2 style="font-size:24px;">حذف عنوان «العمل»؟</h2>
      <p style="margin:8px 0 0; font-size:14px; color:${T.ink80};">القاهرة، التجمع الخامس، التسعين الشمالي — برج كايرو بيزنس، الدور 6.<br>لا يمكن التراجع عن الحذف. الطلبات السابقة تحتفظ بعنوانها.</p>
      <div style="display:flex; gap:12px; margin-top:24px;"><a href="#" class="btn btn-d">${I.trash(16)}حذف العنوان</a><a href="#" class="btn btn-o">إبقاؤه</a></div>
    </div>
  </div>
</div>
</x-dc></body></html>`;

// 6b. Order ticket — dialog over the orders page + the answered thread under the order
files["OrderTicket.dc.html"] = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><script src="./support.js"></script></head><body>
<x-dc><helmet>${FONTS}<style>${CSS}</style></helmet>
<div dir="rtl" style="width:1440px; min-height:1500px; background:${T.ivory}; position:relative;">
  <div style="opacity:.5;">${navbarDesktop({ current: "account" })}
  <div style="max-width:1200px; margin:0 auto; padding:44px 40px 0;">${identityStrip()}<div style="margin-top:28px; border-top:1px solid ${T.rule}; padding-top:36px; display:grid; grid-template-columns:200px minmax(0,1fr); gap:56px;">${rail("orders")}<main>${sectionH("طلباتي", "تتبّع طلباتك الجارية وراجع ما سبق.")}${ordersFilters()}${orderCard(ORDERS[1])}</main></div></div></div>
  <div style="position:absolute; inset:0 0 auto 0; height:760px; background:rgba(21,26,53,.35);"></div>
  <div style="position:absolute; top:120px; inset-inline-start:50%; transform:translateX(50%);">${ticketDialog()}</div>
  <div style="max-width:1200px; margin:0 auto; padding:40px 40px 60px;">
    <p style="margin:0 0 16px; font-size:12px; letter-spacing:.08em; color:${T.ink60}; font-family:Archivo, sans-serif;">AFTER SENDING — THE THREAD LIVES UNDER THE EXPANDED ORDER; THE FOOTER BUTTON BECOMES A STATUS LINK</p>
    <div style="display:grid; grid-template-columns:200px minmax(0,1fr); gap:56px;"><div></div><div style="display:flex; flex-direction:column; gap:16px;">${orderCard(ORDERS[0], { expanded: true })}${ticketThread()}</div></div>
  </div>
</div>
</x-dc></body></html>`;
files["MobileOrderTicket.dc.html"] = mobileShell("orders", `
<div style="display:flex; align-items:center; gap:10px; margin-bottom:20px;"><a href="#" aria-label="رجوع" style="width:40px; height:40px; display:grid; place-items:center; color:${T.ink80}; border:1px solid ${T.rule};">${I.arrL(18)}</a><h2 style="font-size:24px;">الطلب <span class="num" style="font-family:Archivo, sans-serif; font-size:16px; font-weight:600;">#K7M2P9QX</span></h2></div>
${ticketDialog({ compact: true })}
<p style="margin:32px 0 12px; font-size:12px; letter-spacing:.08em; color:${T.ink60}; font-family:Archivo, sans-serif;">AFTER SENDING</p>
${ticketThread({ compact: true })}`, { h: 1500, nav: false });

// 7–9. Mobile pages
files["MobileProfile.dc.html"] = mobileShell("account", accountBody(true), { h: 1560 });
files["MobileAddresses.dc.html"] = mobileShell("addresses", addressesBody(true), { h: 1200 });
files["MobileOrders.dc.html"] = mobileShell("orders", ordersBody(true), { h: 2300 });
files["MobileAddressForm.dc.html"] = mobileShell("addresses", `
<div style="display:flex; align-items:center; gap:10px; margin-bottom:20px;"><a href="#" aria-label="رجوع" style="width:40px; height:40px; display:grid; place-items:center; color:${T.ink80}; border:1px solid ${T.rule};">${I.arrL(18)}</a><h2 style="font-size:26px;">عنوان جديد</h2></div>
${addressForm(true)}`, { h: 1180, nav: false });

// 10. States & components
files["Components.dc.html"] = wrap(1440, 1500, `
${label("STATUS PILLS — ONE VOCABULARY FOR ORDERS EVERYWHERE")}
<div style="background:${T.ivory}; padding:24px 40px; display:flex; gap:28px; flex-wrap:wrap;">${Object.keys(STATUS).map(pill).join("")}</div>
${label("PROGRESS STEPPER — ONE PER ORDER (READY_TO_SHIP SITS ON THE PROCESSING STEP; CANCELLED SHOWS A NOTE INSTEAD)")}
<div style="background:${T.ivory}; padding:24px 40px; display:grid; grid-template-columns:1fr 1fr; gap:32px;">${["CREATED", "CONFIRMED", "READY_TO_SHIP", "DELIVERED"].map((s) => `<div class="panel" style="padding:20px 24px;">${stepper(s)}</div>`).join("")}</div>
${label("LOADING — SKELETONS KEEP THE PAGE SHAPE (NO LOADING TEXT)")}
<div style="background:${T.ivory}; padding:24px 40px; display:grid; grid-template-columns:1fr 1fr; gap:24px;">
  <div class="panel" style="padding:24px 28px; display:flex; flex-direction:column; gap:18px;"><div style="display:flex; justify-content:space-between;"><span class="sk" style="width:120px; height:16px;"></span><span class="sk" style="width:80px; height:16px;"></span></div><span class="sk" style="height:10px;"></span><div style="display:flex; gap:8px;"><span class="sk" style="width:64px; height:80px;"></span><span class="sk" style="width:64px; height:80px;"></span><span class="sk" style="flex:1; height:16px; align-self:center;"></span></div></div>
  <div class="panel" style="padding:22px 24px; display:flex; flex-direction:column; gap:14px;"><span class="sk" style="width:100px; height:18px;"></span><span class="sk" style="height:14px;"></span><span class="sk" style="width:70%; height:14px;"></span><span class="sk" style="width:140px; height:14px;"></span></div>
</div>
${label("EMPTY STATES")}
<div style="background:${T.ivory}; padding:24px 40px; display:grid; grid-template-columns:1fr 1fr; gap:24px;">
  <div class="panel" style="padding:56px 32px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px;"><span style="color:${T.gold};">${I.pkg(40)}</span><h2 style="font-size:24px;">لا توجد طلبات حتى الآن.</h2><p class="muted" style="margin:0; font-size:14px; max-width:320px;">أول طلب لك يظهر هنا مع تتبّع حالته خطوة بخطوة.</p><a href="#" class="btn" style="margin-top:8px;">تسوق الآن</a></div>
  <div class="panel" style="padding:56px 32px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px;"><span style="color:${T.gold};">${I.pin(40)}</span><h2 style="font-size:24px;">لا توجد عناوين محفوظة.</h2><p class="muted" style="margin:0; font-size:14px; max-width:320px;">احفظ عنوانًا مرة واحدة واختره عند الدفع بضغطة.</p><a href="#" class="btn" style="margin-top:8px;">${I.plus(16)}إضافة عنوان</a></div>
</div>
${label("ERROR — DISTINCT FROM EMPTY, WITH RETRY (ORDERS FETCH FAILURE)")}
<div style="background:${T.ivory}; padding:24px 40px;">
  <div role="alert" style="display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 22px; border:1px solid ${T.carn}; background:${T.carnSoft}; flex-wrap:wrap;"><span style="display:flex; align-items:center; gap:12px; color:${T.carn}; font-size:14.5px;">${I.alert(20)}تعذر تحميل طلباتك الآن. لم نفقد شيئًا — حاول مرة أخرى.</span><a href="#" class="btn btn-o btn-sm" style="border-color:${T.carn}; color:${T.carn};">${I.refresh(16)}إعادة المحاولة</a></div>
</div>
${label("TOASTS + INLINE ERRORS (TOASTS FOR OUTCOMES, INLINE FOR FIELD VALIDATION)")}
<div style="background:${T.ivory}; padding:24px 40px; display:flex; gap:24px; flex-wrap:wrap; align-items:flex-start;">
  <div class="toast">${I.check(18)}تم تحديث بيانات الحساب</div>
  <div class="toast" style="border-inline-start-color:${T.carn};">${I.alert(18)}كلمة المرور الحالية غير صحيحة</div>
  <div style="width:320px;">${field("المدينة", "", { err: "المدينة مطلوبة لحساب رسوم الشحن." })}</div>
</div>
${label("BUTTONS + CHIPS + TAGS")}
<div style="background:${T.ivory}; padding:24px 40px; display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
  <a href="#" class="btn">أساسي</a><a href="#" class="btn btn-o">ثانوي</a><a href="#" class="btn btn-d">خطر</a><a href="#" class="btn btn-sm">صغير</a><a href="#" class="btn btn-g">رابط بخط ذهبي</a>
  <span class="chip on">مختار</span><span class="chip">عادي</span>
  <span class="tag tag-gold">${I.star(12)}الافتراضي</span><span class="tag tag-amber">${I.alert(12)}يحتاج المدينة</span><span class="tag">تسمية</span>
</div>
`);

const canvas = {
  artboards: [
    { file: "Main.dc.html", title: "شريط التنقل — 4 حالات", x: 0, y: 0, w: 1440, h: 1780 },
    { file: "MobileDrawer.dc.html", title: "القائمة الجانبية — مسجّل", x: 1540, y: 0, w: 390, h: 1100 },
    { file: "MobileDrawerOut.dc.html", title: "القائمة الجانبية — زائر", x: 2010, y: 0, w: 390, h: 1100 },
    { file: "Profile.dc.html", title: "حسابي", x: 0, y: 1920, w: 1440, h: 1240 },
    { file: "MobileProfile.dc.html", title: "حسابي — موبايل", x: 1540, y: 1920, w: 390, h: 1560 },
    { file: "Addresses.dc.html", title: "عناويني", x: 0, y: 3620, w: 1440, h: 1000 },
    { file: "AddressForm.dc.html", title: "عنوان جديد + حذف", x: 1540, y: 3620, w: 1440, h: 1000 },
    { file: "MobileAddresses.dc.html", title: "عناويني — موبايل", x: 3080, y: 3620, w: 390, h: 1200 },
    { file: "MobileAddressForm.dc.html", title: "عنوان جديد — موبايل", x: 3550, y: 3620, w: 390, h: 1180 },
    { file: "Orders.dc.html", title: "طلباتي", x: 0, y: 4960, w: 1440, h: 1900 },
    { file: "MobileOrders.dc.html", title: "طلباتي — موبايل", x: 1540, y: 4960, w: 390, h: 2300 },
    { file: "OrderTicket.dc.html", title: "سؤال عن الطلب — تذكرة", x: 2010, y: 4960, w: 1440, h: 1500 },
    { file: "MobileOrderTicket.dc.html", title: "سؤال عن الطلب — موبايل", x: 3530, y: 4960, w: 390, h: 1500 },
    { file: "Components.dc.html", title: "الحالات والمكوّنات", x: 0, y: 7400, w: 1440, h: 1500 },
  ],
  annotations: [
    { id: "brief", x: 0, y: -200, w: 520, text: "منطقة الحساب — نفس لغة المتجر (عاجي، لازورد، خط ذهبي، Amiri/Plex/Archivo). الجديد: الأقسام تبقى داخل قائمة البرجر على كل المقاسات، بحث في الشريط، قائمة حساب باسم المستخدم، شريط هوية أعلى الحساب، متتبّع حالة لكل طلب مع تفاصيل قابلة للفتح، بطاقات عناوين مع حوار حذف حقيقي." },
    { id: "ticket", x: 1120, y: -200, w: 520, text: "«سؤال عن الطلب» (قرار المستخدم 2026-09-13): تذكرة داخل الموقع لا واتساب — موضوع من قائمة + رسالة + رقم تواصل، تظهر كخيط تحت الطلب بحالة (بانتظار الرد / تم الرد / مغلقة)، والرد يأتي من لوحة الأدمن. يحتاج نموذج OrderTicket + صندوق وارد في الأدمن." },
    { id: "scope", x: 560, y: -200, w: 520, text: "مقترحات تحتاج موافقة (ليست تكافؤًا): بحث المنتجات في الشريط، إعادة الطلب، إلغاء الطلب قبل التأكيد، «سؤال عن الطلب» = تذكرة داخل الموقع (لوحة OrderTicket)، «عرض طلبات أقدم» (ترقيم)، إكمال العنوان الناقص من البطاقة. صفحة كبار السن خارج النطاق." },
  ],
  launch: { view: "canvas" },
};

for (const [name, src] of Object.entries(files)) fs.writeFileSync(path.join(out, name), src, "utf8");
fs.writeFileSync(path.join(out, "canvas.json"), JSON.stringify(canvas, null, 2), "utf8");
console.log("wrote", Object.keys(files).length, "artboards + canvas.json to", out);
