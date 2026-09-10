# Public — Profile Addresses

Route(s): `app/(public)/profile/addresses/page.tsx` (wrapped by `app/(public)/profile/layout.tsx`)
Key files: `app/api/profile/addresses/route.ts`, `app/api/profile/addresses/[id]/route.ts`, `lib/addresses/create.ts` (`createSavedAddress`), `lib/addresses/completeness.ts` (`isSavedAddressIncomplete`), `lib/services/shipping.ts` (`GOVERNORATE_OPTIONS`, `getPhase1ShippingFee`), `lib/phone.ts` (`normalizeEgyptMobilePhone`), `app/api/auth/me/route.ts`

## Business requirements
- **Goal/KPI**: address-book management directly speeds up checkout for returning customers (pick a saved address instead of re-typing the full Egyptian address format) — a conversion/retention lever.
- **Delivery-expectations/trust**: governorate is a required fixed-vocabulary dropdown of the 27 official Egypt governorates (`GOVERNORATE_OPTIONS`), because shipping fee/serviceability (`getPhase1ShippingFee`, Egypt Post Wasalha, "Phase 1") is computed **by governorate + parcel weight only**. City and area are stored for courier/display purposes but are **not** used to compute shipping cost or gate serviceability.
- **Important correction vs. a cascading-select assumption**: there is **no governorate→area cascading dropdown** on this screen. Governorate is the only constrained field; city and area are plain free-text `Input`s with no autocomplete, no validation against real Egyptian localities, and no dependency on the selected governorate.
- **Friction points**:
  - Legacy addresses created before "city" was required can have a blank city — flagged with an amber "يحتاج المدينة" badge and sorted to the bottom, but nothing forces a fix; the only path to correcting one is manually opening "تعديل".
  - Delete confirmation uses a native browser `confirm()` dialog, not a styled modal — inconsistent visual language versus the rest of the UI.
  - No reordering beyond a single default flag; no way to have e.g. "default for COD" vs "default for prepaid."
  - Each address has its own delivery phone (independently validated as an Egyptian mobile number, can differ from the account's login phone) with no UI explanation of why that's allowed/expected.
- **Compliance**: address data is customer PII; no retention/deletion messaging on this screen itself (only the separate `/privacy` page covers this generically).

## Elements & behavior
- [ ] On mount: two parallel fetches — `GET /api/auth/me` (pre-fills a **new** address's phone field with the account's login phone; failures are silently swallowed, no toast) and `GET /api/profile/addresses` (`load()`, the primary list). A `401` from the addresses fetch triggers a hard redirect (`window.location.href`) to `/login?redirect=/profile/addresses`.
- [ ] List sort — client-side stable partition: addresses with a city first, `isSavedAddressIncomplete` (no city) addresses pushed last; within each group, API order is preserved (`isDefault desc, createdAt desc`).
- [ ] Each address card shows: optional label (e.g. "المنزل"), "يحتاج المدينة" amber badge if incomplete, "افتراضي" primary badge if default, a formatted line (`governorate، city، area، street`, falsy parts filtered, joined with an Arabic comma), the phone (`dir="ltr"`), and three actions — edit (pencil icon), "تعيين افتراضي" (text button, hidden if already default), delete (trash icon, destructive color).
- [ ] "عنوان جديد" button opens the add form pre-filled with the account phone and everything else blank.
- [ ] Add/Edit form (inline card, not a modal), 2-column grid on `sm+`:
  - تسمية (اختياري) — free text, optional.
  - المحافظة * — required `<select>` from `GOVERNORATE_OPTIONS`, native HTML `required`.
  - المدينة * — required free-text `Input`, HTML `required`.
  - هاتف التوصيل * — required `type="tel"` `Input`, `dir="ltr"`, HTML `required`.
  - المنطقة * — required free-text `Input`, HTML `required`.
  - العنوان بالتفصيل * (street) — required free-text `Input`, spans both columns.
  - ملاحظات (اختياري) — free text, spans both columns.
  - **No `building`/`floor`/`apartment` fields are exposed anywhere in this form**, even though the `SavedAddress` model and both `createSavedAddress()` and the PATCH endpoint accept them. `[NEEDS PM INPUT: confirm whether these are intentionally omitted from this UI (entered elsewhere, e.g. checkout) or dead/unused fields before deciding whether to reintroduce them.]`
  - Save ("حفظ" when editing / "إضافة" when creating) and "إلغاء" (cancel, closes + clears the form) buttons.
- [ ] Client submit guard — requires governorate/city/area/street/phone all non-empty (trimmed); otherwise a single destructive toast ("المحافظة والمدينة والمنطقة والعنوان بالتفصيل والهاتف مطلوبة") and no request is sent. Label/floor/apartment/notes are normalized to `null` when blank.
- [ ] Create — `POST /api/profile/addresses` → `createSavedAddress()`: re-validates governorate/city/area/street/phone required server-side too; normalizes phone via `normalizeEgyptMobilePhone` (rejects with `EGYPT_MOBILE_ERROR_MESSAGE` if invalid); if `isDefault` is set, first runs an `updateMany` to unset default on all the user's other addresses (single-default invariant), **not wrapped in a shared transaction** with the subsequent create.
- [ ] Edit — `PATCH /api/profile/addresses/[id]`: ownership-checked first (`findFirst({ id, userId })`, 404 "العنوان غير موجود" if not found/owned). Partial update — only fields present in the body are touched. If the body touches **any** of governorate/city/area/street, the effective city (existing or incoming) must be non-empty. `area`, if present in the body, must independently be non-empty. Phone, if present, is re-normalized/re-validated. `isDefault: true` unsets default on all other addresses first (same non-transactional pattern as create).
- [ ] "تعيين افتراضي" — `PATCH` with only `{ isDefault: true }`; toast "تم تعيين العنوان الافتراضي" on success, list reloads. There is no "un-default" action — the only way to remove default status from one address is to set a different one as default.
- [ ] Delete — native `confirm("حذف هذا العنوان؟")` gate; on confirm, `DELETE /api/profile/addresses/[id]` (ownership-checked); on success, toast "تم حذف العنوان", list reloads, and if the deleted address was the one being edited, the form closes.

## States
- [ ] Empty state — `list.length === 0 && !showForm`: centered card with a `MapPin` icon, "لا توجد عناوين محفوظة." text, and a prominent "إضافة عنوان" button.
- [ ] Loading state — `<h1>عناويني</h1>` + "جاري التحميل…" only; no skeleton list.
- [ ] Error state — all validation/API feedback on this screen is **toast-only**; there is no inline per-field error UI (unlike the partner-request form). Server 400s surface `json.error.message` (fallback "حدث خطأ").
- [ ] Permission-restricted state — the addresses `GET`'s `401` hard-redirects to login (primary guard, alongside the layout's server-side check); `/api/auth/me`'s `401` is silently swallowed, only leaving the phone pre-fill blank.

## Edge cases
- [ ] Legacy address with a blank city — shown with the "يحتاج المدينة" badge, sorted last; can be edited without being forced to fix the city **unless** the edit also touches governorate/city/area/street (in which case city becomes required by that PATCH validation branch).
- [ ] Setting a new default while another exists — the "unset all, then set new" sequence is two separate awaited queries, not a single `$transaction`; a crash between them could theoretically leave zero addresses marked default.
- [ ] Deleting the only/default address — allowed unconditionally; no automatic new default is chosen afterward.
- [ ] `area` is HTML-`required` in the add/edit form, but the PATCH endpoint's server check only enforces it non-empty **when `area` is present in the request body at all** — an edit that omits `area` from its payload entirely bypasses that specific check (create via `createSavedAddress` always requires it).
- [ ] Delivery phone differs from the account's login phone — expected and allowed; each is independently validated as an Egyptian mobile number.
- [ ] Rapid double-submit — the Save button has **no** `disabled`-while-submitting guard (unlike the partner-request form and the account page), so a fast double click can fire duplicate create/update requests.

## Notes
- Unlike a typical Egypt-market cascading governorate→area picker, this screen treats city/area as unconstrained free text; only governorate is a fixed list, and it alone drives shipping cost (weight-based, per governorate zone) — city/area carry no pricing or serviceability logic.
- `building`/`floor`/`apartment` exist in the data model and update API but have no form fields here — verify intent before the rebuild silently drops or silently adds them back.
- The `401` handling pattern here (`window.location.href`, full reload) differs from the `router.replace()` pattern used on `/profile/senior` — worth normalizing across all profile screens in the rebuild.
