# Public — Become a Partner (partner request form)

Route(s): `app/(public)/partners/page.tsx`, `app/(public)/partners/layout.tsx`
Key files: `app/api/partner-requests/route.ts`, `lib/partner-request-schema.ts`, `lib/phone.ts` (`normalizeEgyptMobilePhone`), `lib/services/shipping.ts` (`GOVERNORATE_OPTIONS`), `lib/email.ts` (`sendPartnerRequestNotification`), `lib/seo.ts` (`pageMetadata`), Prisma model `PartnerRequest`, enum `PartnerRequestType`

## Business requirements
- **Goal/KPI**: acquisition/lead-gen for the fulfillment network. This is the only public entry point that creates a `PartnerRequest` row, which an admin later reviews and can convert into an active `Partner` (see `app/api/admin/partner-requests/[id]/convert`, out of scope here). It directly feeds governorate-level order-routing/partner-fulfillment capacity, not just marketing.
- **Two distinct request types**: "وكيل أونلاين" (`AGENT`) and "موزع أونلاين" (`DISTRIBUTOR`) map 1:1 onto `Partner.partnerType`, the same enum used across partner dashboards and admin partner management — the rebuild must keep exactly these two options, not merge or relabel them without a data-model conversation.
- **Trust/credibility signals**: minimal today — no examples of existing partners, no explanation of how Agent differs from Distributor, no commission/incentive framing, no FAQ, no direct phone/WhatsApp contact alternative, no link to `/terms` or `/privacy` from this form despite collecting name/phone/governorate PII.
- **Friction points**:
  - Governorate is a required fixed-vocabulary select (27 official governorates) but there is no city/area field — the applicant only declares a governorate, not a specific coverage area.
  - Phone format is only checked client-side for *presence*, not format; the real Egyptian-mobile-number validation (`010/011/012/015` via `normalizeEgyptMobilePhone`) happens server-side, so a malformed phone only errors out after a round trip, and only as a generic toast (no inline field error is populated from the server response).
  - No persistent confirmation screen or request reference id after submit — success is a toast only, then the form silently resets; a user who navigates away has no record of having applied.
  - Switching between the Agent/Distributor tabs discards all typed data with no warning.
- **Compliance**: no consent checkbox or privacy-policy link on this PII-collecting form.
- No SEO structured data beyond `pageMetadata` (title/description) set in `layout.tsx`.

## Elements & behavior
- [ ] Page header — static: kicker "NILE KINGS PARTNER'S", `<h1>` "شركاؤنا", intro paragraph. Same in both loading fallback and loaded states.
- [ ] Tabs — two buttons: "تسجيل وكيل أونلاين" (`AGENT`) / "تسجيل موزع أونلاين" (`DISTRIBUTOR`). Initial tab is derived from the `?type=` query param: `type=distributor` → `DISTRIBUTOR`, anything else (including absent) → `AGENT`. A `useEffect` re-syncs the active tab whenever the query param changes (e.g. back/forward navigation).
- [ ] Switching tabs — resets `form` to blank and clears all `errors` (full reset, not a merge); card title/subtitle swap per tab via a `FORM_TITLES` map.
- [ ] Field: الاسم (name) — required text `Input`, `maxLength=200`, `autoComplete="name"`; sanitized (trim + slice to 200) client-side before submit.
- [ ] Field: المحافظة (governorate) — required native `<select>` sourced from `GOVERNORATE_OPTIONS` (27 canonical Egypt governorate labels), placeholder "اختر المحافظة".
- [ ] Field: رقم التليفون (phone) — required `type="tel"` `Input`, `maxLength=30`, `autoComplete="tel"`.
- [ ] 6 optional social/link fields (all `type="url"`, `maxLength=500`, icon + input row): Facebook, Instagram, TikTok, YouTube, رابط الموقع (Website), رابط آخر (Other).
- [ ] Submit button "إرسال الطلب" — full width on mobile; disabled while `loading`; shows a spinner + "جاري الإرسال..." while a request is in flight. All inputs (`Input`/`select`) are also `disabled={loading}` during submit.
- [ ] Client-side `validate()` — checks only that trimmed name/governorate/phone are non-empty; does **not** validate phone format or URL format. Field-level red border + red helper text under name/governorate/phone when empty.
- [ ] Submit flow — `POST /api/partner-requests` with `{ requestType, name, governorate, phone, facebookUrl…otherUrl (trimmed or null) }`.
  - Success (`json.success`): toast "تم الإرسال بنجاح" with server `message` (default "سنتواصل معك قريباً"); form resets to blank; errors cleared.
  - Failure: toast "فشل الإرسال" with `json.error.message` or a generic Arabic fallback.
  - Network exception: toast "فشل الإرسال" / "حدث خطأ في الاتصال".
- [ ] Server validation (`partnerRequestBodySchema`, zod) — `requestType` must be `AGENT`/`DISTRIBUTOR`; `name` 1–200 chars; `governorate` 1–100 chars; `phone` normalized and must pass `normalizeEgyptMobilePhone` (Egyptian mobile prefixes `010/011/012/015`, via `libphonenumber-js`) else returns `EGYPT_MOBILE_ERROR_MESSAGE`; each social URL optional, ≤500 chars, empty coerced to `null`. On failure, the API returns only the **first** field's first error message (`apiBadRequest`, 400).
- [ ] On success, server creates a `PartnerRequest` row (`status` defaults `PENDING`) and best-effort emails a notification (`sendPartnerRequestNotification`) — a send failure is only `console.warn`'d, never surfaced to the applicant or blocking the response.
- [ ] No CAPTCHA or rate limiting on this route.
- [ ] Whole page is wrapped in `React.Suspense` (needed because it reads `useSearchParams()`); the fallback renders the identical static header + disabled tab buttons + an `h-[320px] animate-pulse` skeleton block in place of the card body.

## States
- [ ] Empty state — not applicable; the form is always rendered once past the Suspense boundary.
- [ ] Loading state — Suspense fallback (`PartnersPageFallback`): static header, disabled tabs, pulsing skeleton block instead of the form. Separately, per-submit "loading": submit button shows spinner + "جاري الإرسال...", and every field is disabled for the duration.
- [ ] Error state — inline field errors (destructive text + border) only for the three client-checked required fields (name/governorate/phone non-empty); all other failures (server 400, network error) are toast-only with no persistent inline banner.
- [ ] Permission-restricted state — none; the page is fully public with no auth check.

## Edge cases
- [ ] Switching tabs mid-fill discards all entered data with no confirmation prompt.
- [ ] Resubmission is guarded client-side by the `loading` flag (prevents double-click), but there is no idempotency key server-side, so a forced retry (e.g. flaky network) could create duplicate `PartnerRequest` rows.
- [ ] Invalid Egyptian phone (e.g. a landline or foreign number) passes client validation (non-empty only) and is only rejected server-side, surfacing as a generic toast rather than an inline phone-field error.
- [ ] Malformed JSON request body → 400 "جسم الطلب غير صالح".
- [ ] Email notification failure leaves the request stored successfully in the DB but silently invisible to anyone without server-log access — an admin could miss a new lead if SMTP isn't configured, with zero user-facing signal.
- [ ] A social URL over 500 chars is blocked server-side ("الرابط طويل جداً") even though the `Input`'s `maxLength=500` should normally prevent this from being typed — only reachable via an unusual paste/programmatic path.

## Notes
- The `?type=distributor` query parameter is the only URL contract this screen exposes; preserve it if anything elsewhere in the app deep-links to "become a distributor" specifically (verify before removing).
- Admin-side review/approval and conversion into an actual `Partner` record happens entirely off this screen — this file only covers the public request-submission UI.
- No route change: this screen must stay at `/partners`.
