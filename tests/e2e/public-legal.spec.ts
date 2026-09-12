import { test, expect } from "@playwright/test";

// Backlog 4.15 (Legal: /terms, /privacy) regression coverage — same one-happy-path-per-screen
// pattern as tests/e2e/public-shell.spec.ts. Both pages are fully static (no data fetching, no
// client state besides the TOC's current-section mark), so this spec only needs to prove: every
// section heading renders (15 on /terms, 13 on /privacy, per the feature-parity inventories), and
// a table-of-contents link scrolls its target section to a position clear of the fixed navbar
// (not hidden under it). Read-only navigation — no DB writes, so test-env.ts's guard does not
// apply.

const TERMS_HEADINGS = [
  "التعريفات",
  "استخدام الموقع",
  "المنتجات والمقاسات",
  "الأسعار والدفع",
  "تأكيد الطلب",
  "الشحن والتوصيل",
  "سياسة الاستبدال والاسترجاع",
  "عيوب الصناعة",
  "استرداد المبالغ",
  "العروض والخصومات",
  "حقوق الملكية الفكرية",
  "حدود المسؤولية",
  "التعديلات",
  "القانون الواجب التطبيق",
  "التواصل معنا",
];

const PRIVACY_HEADINGS = [
  "مقدمة",
  "البيانات التي نجمعها",
  "استخدام البيانات",
  "الدفع والمعاملات المالية",
  "ملفات تعريف الارتباط والبيانات الفنية",
  "مشاركة البيانات",
  "حماية البيانات",
  "الاحتفاظ بالبيانات",
  "حقوق العميل",
  "بيانات الأطفال",
  "روابط وخدمات خارجية",
  "تحديثات سياسة الخصوصية",
  "التواصل معنا",
];

test("/terms renders all 15 section headings", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "الشروط والأحكام" })).toBeVisible();
  expect(TERMS_HEADINGS).toHaveLength(15);
  for (const [index, title] of TERMS_HEADINGS.entries()) {
    const section = page.locator(`#section-${index + 1}`);
    await expect(section.getByRole("heading", { level: 2 })).toContainText(title);
  }
});

test("/privacy renders all 13 section headings", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "سياسة الخصوصية" })).toBeVisible();
  expect(PRIVACY_HEADINGS).toHaveLength(13);
  for (const [index, title] of PRIVACY_HEADINGS.entries()) {
    const section = page.locator(`#section-${index + 1}`);
    await expect(section.getByRole("heading", { level: 2 })).toContainText(title);
  }
});

test("a desktop TOC link scrolls its section clear of the fixed navbar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/terms");

  const targetIndex = 6; // "سياسة الاستبدال والاسترجاع" — well past the first screenful.
  const tocLink = page
    .locator("aside")
    .getByRole("link", { name: new RegExp(TERMS_HEADINGS[targetIndex]) });
  await tocLink.click();

  const section = page.locator(`#section-${targetIndex + 1}`);
  await expect(section).toBeInViewport();

  // The fixed navbar is 84px tall at `lg`; the section's heading must land below it, not under it.
  const box = await section.boundingBox();
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(84);
});
