# Public — Privacy Policy

Route(s): `app/(public)/privacy/page.tsx`
Key files: `components/legal/legal-page.tsx` (shared `LegalPage` shell, also used by `/terms`)

## Business requirements
- **Goal**: legal/compliance and trust page — Egyptian consumer-data-handling transparency, supports trust for a storefront collecting phone/address data and processing payments.
- **Confirmed fully static**: nothing dynamic hides on this screen. `app/(public)/privacy/page.tsx` is a server component with a hard-coded `sections` array of Arabic JSX content; `LegalPage` is a pure presentational component with no data fetching, no client state, no `"use client"` directive anywhere in the chain — only in-page anchor scrolling.
- `updatedAt="6 أغسطس 2026"` is a hard-coded string in the page file, not derived from a CMS/DB field — any future policy update requires a code change and redeploy, not a content-editor action. `[NEEDS PM INPUT: confirm this is acceptable for the rebuild, or whether legal content should move to a CMS/DB field.]`
- Static Next `Metadata` export (title/description) must be preserved for SEO.

## Elements & behavior
- [ ] Header — `ShieldCheck` icon, "Nile Kings Legal" kicker, `<h1>` "سياسة الخصوصية", description paragraph, "آخر تحديث: <date>" pill.
- [ ] Sticky sidebar table of contents ("المحتويات") — one anchor link per section, jumping to `#section-N`; sticky on desktop (`lg:sticky lg:top-32`).
- [ ] 13 numbered content sections, in order: مقدمة، البيانات التي نجمعها، استخدام البيانات، الدفع والمعاملات المالية، ملفات تعريف الارتباط والبيانات الفنية، مشاركة البيانات، حماية البيانات، الاحتفاظ بالبيانات، حقوق العميل، بيانات الأطفال، روابط وخدمات خارجية، تحديثات سياسة الخصوصية، التواصل معنا.
- [ ] No forms, no buttons other than the in-page anchor links.

## States
- [ ] Empty state — n/a, content is always present (static).
- [ ] Loading state — n/a, server-rendered static content.
- [ ] Error state — n/a, no data fetching exists to fail.
- [ ] Permission-restricted state — n/a, fully public.

## Edge cases
- [ ] None identified — no dynamic inputs or user-triggered state changes exist on this screen.

## Notes
- Safe to treat as pure content/design work in the rebuild. The only functional requirements are: preserve the 13 section headings/content verbatim (legal text), and preserve the anchor-based table-of-contents behavior including the `scroll-mt-32` offset so a jumped-to section isn't hidden under a sticky header.
