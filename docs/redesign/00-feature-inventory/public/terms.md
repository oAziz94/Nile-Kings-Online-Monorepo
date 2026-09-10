# Public — Terms of Service

Route(s): `app/(public)/terms/page.tsx`
Key files: `components/legal/legal-page.tsx` (shared `LegalPage` shell, also used by `/privacy`)

## Business requirements
- **Goal**: legal/compliance page — sets pricing, order-confirmation, shipping, and return/exchange expectations before purchase under Egyptian consumer-protection law; reduces dispute/chargeback risk.
- **Confirmed fully static**, same `LegalPage` shell/pattern as `/privacy` — no data fetching, no forms, no client state anywhere in the chain.
- **Substantive policy content the rest of the storefront must stay consistent with** (verified from the actual section text, not assumed):
  - Underwear/intimate apparel **cannot be exchanged or returned once opened, unsealed, tried on, or used**, for hygiene/safety reasons (سياسة الاستبدال والاسترجاع section). Exceptions are limited to: a proven manufacturing defect, receiving the wrong product, receiving the wrong size/color versus what was ordered, or shipping damage — claimable within **30 days of receipt** (عيوب الصناعة section). `[Cross-reference for PM: confirm the PDP/cart/checkout screen inventories state this same no-return-on-opened-underwear policy consistently, so messaging doesn't drift between screens in the rebuild.]`
  - Prices are in EGP; a later price change does not retroactively affect an already-confirmed order; the shop reserves the right to cancel orders for stock unavailability, failed customer verification, inability to reach the customer, a clear pricing/description error, or suspected abuse — with a refund via the original payment method when applicable.
  - Governing law: Egyptian law (including consumer-protection law); Egyptian courts have jurisdiction over disputes.
- `updatedAt="6 أغسطس 2026"` is hard-coded in the page file, same CMS caveat as `/privacy`.

## Elements & behavior
- [ ] Same `LegalPage` shell as `/privacy`: header (`FileText` icon, "الشروط والأحكام", description, "آخر تحديث" pill), sticky sidebar table of contents.
- [ ] 15 numbered content sections, in order: التعريفات، استخدام الموقع، المنتجات والمقاسات، الأسعار والدفع، تأكيد الطلب، الشحن والتوصيل، سياسة الاستبدال والاسترجاع، عيوب الصناعة، استرداد المبالغ، العروض والخصومات، حقوق الملكية الفكرية، حدود المسؤولية، التعديلات، القانون الواجب التطبيق، التواصل معنا.
- [ ] No forms, no buttons other than the in-page anchor links.

## States
- [ ] Empty state — n/a, content is always present (static).
- [ ] Loading state — n/a, server-rendered static content.
- [ ] Error state — n/a, no data fetching exists to fail.
- [ ] Permission-restricted state — n/a, fully public.

## Edge cases
- [ ] None identified — no dynamic inputs or user-triggered state changes exist on this screen.

## Notes
- Safe to treat as pure content/design work in the rebuild. The only functional requirements are: preserve the 15 section headings/content verbatim (legal text, including the specific return/exchange and refund-timing language), and preserve the anchor-based table-of-contents behavior (`scroll-mt-32` offset).
- Because this page encodes real operational policy (returns, cancellations, refund timing), treat its text as a source of truth to cross-check against checkout/PDP/cart copy during the redesign, not merely decorative legal boilerplate.
