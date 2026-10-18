/**
 * Backlog 10.47 — Egypt areas per governorate, for the storefront location modal's المنطقة
 * dropdown (10.48), the checkout/profile address forms, and the nationwide
 * "area → governorate" silent correction (owner, 2026-10-11). Supersedes
 * `egypt-areas-greater-cairo.ts`, whose Greater Cairo neighbourhoods are folded in here.
 *
 * Granularity: مراكز / cities / major districts (بيلا, دسوق, مدينة نصر) — not streets or small
 * villages; a visitor whose place is missing picks "أخرى…" and types it (10.48). Keys are the
 * exact `GOVERNORATE_OPTIONS` values from `lib/services/shipping.ts`.
 *
 * Client-side static data only — no DB or API calls.
 */

export const EGYPT_AREAS: Record<string, readonly string[]> = {
  "القاهرة": [
    "مدينة نصر", "مصر الجديدة", "النزهة", "عين شمس", "المطرية", "المرج", "السلام", "شبرا",
    "روض الفرج", "الساحل", "الزاوية الحمراء", "حدائق القبة", "الوايلي", "الزيتون", "الشرابية",
    "الأميرية", "عزبة النخل", "حلوان", "المعادي", "البساتين", "دار السلام", "طرة", "التبين",
    "15 مايو", "القاهرة الجديدة", "التجمع الخامس", "التجمع الأول", "الرحاب", "مدينتي", "الشروق",
    "بدر", "العاصمة الإدارية", "الزمالك", "وسط البلد", "عابدين", "الموسكي", "الأزبكية", "بولاق",
    "الجمالية", "باب الشعرية", "الدرب الأحمر", "السيدة زينب", "مصر القديمة", "الخليفة", "المقطم",
    "منشأة ناصر", "المنيل", "جاردن سيتي", "الألف مسكن", "الحلمية", "المعصرة",
  ],
  "الجيزة": [
    "الدقي", "المهندسين", "العجوزة", "إمبابة", "الوراق", "بولاق الدكرور", "الهرم", "فيصل",
    "العمرانية", "الطالبية", "حدائق الأهرام", "الشيخ زايد", "6 أكتوبر", "حدائق أكتوبر", "كرداسة",
    "أوسيم", "الحوامدية", "البدرشين", "العياط", "الصف", "أطفيح", "منشأة القناطر", "أبو النمرس",
    "الواحات البحرية", "المنيب", "الجيزة", "الكيت كات", "المريوطية",
  ],
  "القليوبية": [
    "بنها", "شبرا الخيمة", "القناطر الخيرية", "الخانكة", "العبور", "قليوب", "طوخ", "كفر شكر",
    "شبين القناطر", "قها", "الخصوص", "بهتيم", "مسطرد", "أبو زعبل",
  ],
  "الإسكندرية": [
    "المنتزه", "سيدي جابر", "سموحة", "الرمل", "محرم بك", "العطارين", "الجمرك", "اللبان", "المنشية",
    "كرموز", "باب شرق", "الدخيلة", "العجمي", "العامرية", "برج العرب", "مينا البصل", "سيدي بشر",
    "ميامي", "المعمورة", "أبو قير", "سان ستيفانو", "جليم", "كليوباترا", "بولكلي", "فلمنج",
    "فيكتوريا", "المندرة", "العصافرة", "كينج مريوط", "الإبراهيمية", "سبورتنج", "كامب شيزار",
    "الشاطبي", "الأزاريطة", "بحري", "الورديان", "القباري", "المكس", "الهانوفيل", "البيطاش",
    "زيزينيا", "رشدي", "لوران", "ستانلي", "الحضرة", "غيط العنب", "كفر عبده",
  ],
  "كفر الشيخ": [
    "كفر الشيخ", "دسوق", "بيلا", "فوه", "مطوبس", "سيدي سالم", "الحامول", "بلطيم", "قلين",
    "الرياض", "البرلس", "سيدي غازي",
  ],
  "دمياط": [
    "دمياط", "دمياط الجديدة", "رأس البر", "فارسكور", "كفر سعد", "الزرقا", "كفر البطيخ",
    "عزبة البرج", "السرو", "الروضة", "ميت أبو غالب",
  ],
  "الغربية": [
    "طنطا", "المحلة الكبرى", "كفر الزيات", "زفتى", "السنطة", "قطور", "بسيون", "سمنود",
  ],
  "البحيرة": [
    "دمنهور", "كفر الدوار", "رشيد", "إدكو", "أبو حمص", "الدلنجات", "المحمودية", "الرحمانية",
    "إيتاي البارود", "حوش عيسى", "شبراخيت", "كوم حمادة", "بدر", "وادي النطرون", "النوبارية",
    "أبو المطامير",
  ],
  "المنوفية": [
    "شبين الكوم", "منوف", "أشمون", "الباجور", "بركة السبع", "تلا", "قويسنا", "السادات", "الشهداء",
    "سرس الليان",
  ],
  "الشرقية": [
    "الزقازيق", "العاشر من رمضان", "بلبيس", "منيا القمح", "أبو حماد", "أبو كبير", "فاقوس", "ههيا",
    "كفر صقر", "أولاد صقر", "الحسينية", "الإبراهيمية", "ديرب نجم", "مشتول السوق", "القنايات",
    "الصالحية الجديدة", "القرين", "صان الحجر",
  ],
  "الدقهلية": [
    "المنصورة", "طلخا", "ميت غمر", "دكرنس", "أجا", "منية النصر", "السنبلاوين", "المطرية",
    "الجمالية", "شربين", "بلقاس", "تمي الأمديد", "نبروه", "بني عبيد", "المنزلة", "ميت سلسيل",
    "جمصة", "محلة دمنة", "الكردي",
  ],
  "السويس": ["السويس", "الأربعين", "عتاقة", "فيصل", "الجناين", "العين السخنة"],
  "الإسماعيلية": [
    "الإسماعيلية", "فايد", "القنطرة شرق", "القنطرة غرب", "التل الكبير", "أبو صوير", "القصاصين",
  ],
  "بورسعيد": ["بورسعيد", "بورفؤاد", "الشرق", "العرب", "المناخ", "الضواحي", "الزهور", "الجنوب"],
  "بني سويف": [
    "بني سويف", "الواسطى", "ناصر", "إهناسيا", "ببا", "سمسطا", "الفشن", "بني سويف الجديدة",
  ],
  "الفيوم": ["الفيوم", "سنورس", "إطسا", "طامية", "يوسف الصديق", "إبشواي", "الفيوم الجديدة"],
  "سوهاج": [
    "سوهاج", "أخميم", "البلينا", "المراغة", "المنشأة", "جرجا", "جهينة", "دار السلام", "ساقلتة",
    "طما", "طهطا", "العسيرات", "سوهاج الجديدة",
  ],
  "المنيا": [
    "المنيا", "العدوة", "مغاغة", "بني مزار", "مطاي", "سمالوط", "أبو قرقاص", "ملوي", "دير مواس",
    "المنيا الجديدة",
  ],
  "أسيوط": [
    "أسيوط", "ديروط", "القوصية", "منفلوط", "أبنوب", "أبو تيج", "الغنايم", "ساحل سليم", "البداري",
    "صدفا", "الفتح", "أسيوط الجديدة",
  ],
  "قنا": [
    "قنا", "أبو تشت", "فرشوط", "نجع حمادي", "دشنا", "الوقف", "قفط", "قوص", "نقادة", "قنا الجديدة",
  ],
  "الأقصر": ["الأقصر", "الطود", "إسنا", "أرمنت", "القرنة", "البياضية", "الزينية", "طيبة الجديدة"],
  "أسوان": [
    "أسوان", "كوم أمبو", "دراو", "نصر النوبة", "إدفو", "أبو سمبل", "أسوان الجديدة", "كلابشة",
  ],
  "مرسى مطروح": [
    "مرسى مطروح", "الحمام", "العلمين", "الضبعة", "النجيلة", "سيدي براني", "السلوم", "سيوة",
  ],
  "البحر الأحمر": ["الغردقة", "رأس غارب", "سفاجا", "القصير", "مرسى علم", "شلاتين", "حلايب"],
  "شمال سيناء": ["العريش", "الشيخ زويد", "رفح", "بئر العبد", "الحسنة", "نخل"],
  "جنوب سيناء": [
    "شرم الشيخ", "دهب", "نويبع", "طابا", "سانت كاترين", "أبو رديس", "أبو زنيمة", "رأس سدر",
    "طور سيناء",
  ],
  "الوادي الجديد": ["الخارجة", "الداخلة", "الفرافرة", "باريس", "بلاط"],
};

/**
 * Names that exist in more than one governorate. `resolveGovernorateForArea` returns `null`
 * for these (never guess) — the dropdown still lists each one under its own governorate.
 */
export const AREA_HOMONYMS: readonly string[] = [
  "المطرية", // القاهرة / الدقهلية
  "الجمالية", // القاهرة / الدقهلية
  "دار السلام", // القاهرة / سوهاج
  "فيصل", // الجيزة / السويس
  "بدر", // القاهرة / البحيرة
  "الإبراهيمية", // الإسكندرية / الشرقية
];

/** Extra spellings people type that should resolve to the canonical label. */
const ALIASES: Record<string, string> = {
  "٦ أكتوبر": "6 أكتوبر",
  "السادس من أكتوبر": "6 أكتوبر",
  "6 اكتوبر": "6 أكتوبر",
  "اكتوبر": "6 أكتوبر",
  "زايد": "الشيخ زايد",
  "التجمع": "التجمع الخامس",
  "مدينه نصر": "مدينة نصر",
  "مصر الجديده": "مصر الجديدة",
  "المعادى": "المعادي",
  "الدقى": "الدقي",
  "المحله": "المحلة الكبرى",
  "المحلة": "المحلة الكبرى",
  "كفر الزيات": "كفر الزيات",
  "شبين": "شبين الكوم",
  "العاشر": "العاشر من رمضان",
  "القاهره الجديده": "القاهرة الجديدة",
  "15 مايو": "15 مايو",
  "١٥ مايو": "15 مايو",
  "رأس البر": "رأس البر",
  "راس البر": "رأس البر",
  "الاسماعيليه": "الإسماعيلية",
  "بور سعيد": "بورسعيد",
  "بور فؤاد": "بورفؤاد",
  "شرم": "شرم الشيخ",
  "الغردقه": "الغردقة",
  "العريش": "العريش",
  "كفرالشيخ": "كفر الشيخ",
  "العلمين الجديدة": "العلمين",
  "السخنة": "العين السخنة",
  "مرسي مطروح": "مرسى مطروح",
  "مطروح": "مرسى مطروح",
};

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * Loose Arabic normaliser for matching what a customer typed against the list: strips
 * tashkeel and tatweel, folds أ/إ/آ → ا, ة → ه, ى → ي, Arabic-Indic digits → ASCII, collapses
 * whitespace. Used for lookups only — stored/displayed values stay the canonical label.
 */
export function normalizeAreaName(input: string): string {
  let s = input.trim();
  s = s.replace(/[ً-ْـ]/g, "");
  s = s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  s = s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)));
  s = s.replace(/\s+/g, " ").toLowerCase();
  return s;
}

type Index = { byArea: Map<string, string[]>; canonical: Map<string, string> };

let index: Index | null = null;

function buildIndex(): Index {
  const byArea = new Map<string, string[]>();
  const canonical = new Map<string, string>();
  for (const [gov, areas] of Object.entries(EGYPT_AREAS)) {
    for (const area of areas) {
      const key = normalizeAreaName(area);
      canonical.set(key, area);
      const govs = byArea.get(key) ?? [];
      if (!govs.includes(gov)) govs.push(gov);
      byArea.set(key, govs);
    }
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    const targetKey = normalizeAreaName(target);
    const govs = byArea.get(targetKey);
    if (!govs) continue;
    const aliasKey = normalizeAreaName(alias);
    if (!byArea.has(aliasKey)) {
      byArea.set(aliasKey, govs);
      canonical.set(aliasKey, target);
    }
  }
  return { byArea, canonical };
}

function getIndex(): Index {
  if (!index) index = buildIndex();
  return index;
}

/** Areas for the dropdown, in curated order (main city first). Empty for an unknown governorate. */
export function getAreasForGovernorate(governorate: string): readonly string[] {
  return EGYPT_AREAS[governorate.trim()] ?? [];
}

/** Canonical label for a typed area (`"مدينه نصر"` → `"مدينة نصر"`), or `null` if unknown. */
export function canonicalAreaName(area: string): string | null {
  return getIndex().canonical.get(normalizeAreaName(area)) ?? null;
}

/**
 * The one governorate a typed area is confidently known to belong to, or `null` when the area
 * is unknown or a homonym (listed under several governorates). Used to silently correct the
 * governorate pick nationwide (owner, 2026-10-11 Q5) — the caller only overrides when this
 * returns a different governorate than the one chosen.
 */
export function resolveGovernorateForArea(area: string): string | null {
  const govs = getIndex().byArea.get(normalizeAreaName(area));
  if (!govs || govs.length !== 1) return null;
  return govs[0];
}

/** True when `area` is listed under `governorate` (canonical or alias spelling). */
export function isKnownAreaOf(governorate: string, area: string): boolean {
  const govs = getIndex().byArea.get(normalizeAreaName(area));
  return !!govs && govs.includes(governorate.trim());
}

/**
 * Silent governorate correction (backlog 10.48), shared by the client forms and every server
 * entry point that stores an address. Returns the governorate the area confidently belongs to
 * when it differs from the submitted one; otherwise returns `governorate` unchanged. Unknown
 * areas and `AREA_HOMONYMS` (listed under several governorates) never correct anything.
 */
export function correctGovernorateForArea(governorate: string, area: string | null | undefined): string {
  if (!area || !area.trim()) return governorate;
  const resolved = resolveGovernorateForArea(area);
  return resolved && resolved !== governorate.trim() ? resolved : governorate;
}
