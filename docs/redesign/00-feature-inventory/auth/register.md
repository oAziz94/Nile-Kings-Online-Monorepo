# (auth) — Register

Route(s): `app/(auth)/register` → `/register`
Key files: `app/(auth)/register/page.tsx`, `app/(auth)/layout.tsx`, `app/api/auth/register/route.ts`, `lib/auth/session.ts`, `lib/auth/password.ts`, `lib/phone.ts`, `lib/country-codes.ts`, `lib/cart/cart.ts` (`mergeGuestCartIntoUser`), `lib/addresses/merge-guest-address.ts`

## Business requirements
- **Goal/KPI**: acquisition — convert a guest (who may already have items in a guest cart / a checkout address cookie) into a registered account with as few steps as possible; the two-step phone-then-profile form and the guest-cart/address merge on success both exist to protect the purchase the user was already in the middle of.
- **Trust/credibility signals**: same Arabic/phone-first identity model as login; account is created and the user is **immediately logged in** (no separate "verify your phone" step today — see friction/ambiguity below), which minimizes drop-off but also means phone ownership is never actually verified at registration.
- **Friction points (observed in code)**:
  - No phone verification (OTP) at all in the live register flow — a user can register with any syntactically-valid Egyptian number, including one they don't own, and no SMS is ever sent. This is a notable gap versus the "OTP verification for register" expectation and versus how `forgot-password` behaves.
  - Same country-code-dropdown-vs-Egypt-only-backend mismatch as login (see login.md) — picking a non-`+20` code always fails.
  - Registering with a phone number that's already in the system (including one that only ever went through the dead OTP-only path and has no password) is flatly rejected with no path to "claim"/set a password on that existing account from this screen.
  - No client-side email format validation (field is `type="email"` for browser-level hinting only); server also does not validate email format, just trims and stores or nulls it.
- **Compliance/legal**: password minimum length (8 chars) enforced both client and server; no explicit terms/privacy-policy checkbox or link on this form (worth flagging — Egyptian ecommerce norms typically expect a link to terms at account creation, and the app does have `/terms` and `/privacy` static pages per the inventory index, just not referenced here).
- **Modern-look rationale**: two-step phone→profile flow and rounded-2xl inputs are UX/aesthetic; no other functional driver found.

## Elements & behavior
- [ ] **No server-side auth guard on this page** — unlike `/login`, `RegisterPage` has no `getCurrentUser()` check; an already-logged-in user who navigates to `/register` still sees the full registration form (this is a real discrepancy vs. login's behavior, not a redesign assumption).
- [ ] **Step "phone"** (initial step):
  - Phone `Input` (`type="tel"`, placeholder `1xxxxxxxxx`, `dir="ltr"`, `autoComplete="tel-national"`) + country-code `<select>` (`COUNTRY_CODES`, default `+20`), laid out `Input` then `select` (same left-to-right order as login).
  - "متابعة" (Continue) button — `onSubmit` → `preventDefault`; if phone (trimmed) is empty, destructive toast "أدخل رقم الجوال" and stay on step; otherwise `setStep("profile")`. **No server call and no phone-format validation happens at this step** — invalid/foreign numbers are only caught later, at final submit.
- [ ] **Step "profile"** (after Continue):
  - Full name `Input` (`type="text"`, placeholder "الاسم الكامل", `autoComplete="name"`).
  - Email `Input` (`type="email"`, placeholder "البريد الإلكتروني (اختياري)" — explicitly optional, `autoComplete="email"`).
  - Password `Input` (`type="password"`, placeholder shows the 8-char minimum inline, `autoComplete="new-password"`).
  - Confirm-password `Input` (`type="password"`, placeholder "تأكيد كلمة المرور", `autoComplete="new-password"`).
  - "إنشاء الحساب" (Create account) submit button — `disabled` while `loading`, label swaps to "جاري إنشاء الحساب…".
  - "تغيير الرقم" (Change number) ghost button — `setStep("phone")`, returns to the phone step; previously entered name/email/password values are **not** cleared (kept in state) but the phone step is shown again.
- [ ] **Submit flow (`handleRegister`)**:
  1. `preventDefault`.
  2. Client validation, in order, each with a destructive toast and early return on failure:
     - name trimmed length < 2 → "الاسم مطلوب (حرفان على الأقل)".
     - password length < 8 → "كلمة المرور يجب أن تكون 8 أحرف على الأقل".
     - password !== confirmPassword → "كلمتا المرور غير متطابقتين".
  3. Builds `full = countryCode + digits-only(phone)`, `POST /api/auth/register` with `{ phone, name: name.trim(), email: email.trim() || undefined, password }`.
  4. Non-OK response → destructive toast with server message or fallback "فشل إنشاء الحساب"; stays on the profile step with values intact.
  5. OK response → success toast "تم إنشاء الحساب"; redirect target is `redirectTo?.startsWith("/") ? redirectTo : "/"` (note: **weaker** open-redirect guard than login's `safeRedirect` — does not explicitly reject `"//host"` or `"/\\host"`, only requires the string start with `/`). `router.push(path)` + `router.refresh()`.
- [ ] **"لديك حساب؟ تسجيل الدخول" link** → `/login`.
- [ ] **"العودة للمتجر" link** → `/`.
- [ ] **Server route `POST /api/auth/register`**:
  1. Malformed JSON → 400 "جسم الطلب غير صالح".
  2. Missing phone → 400 "رقم الجوال مطلوب".
  3. Missing name or trimmed length < 2 → 400 "الاسم مطلوب (حرفان على الأقل)".
  4. Missing password or length < 8 → 400 "كلمة المرور مطلوبة (8 أحرف على الأقل)".
  5. `normalizeEgyptMobilePhone` fails → 400 `EGYPT_MOBILE_ERROR_MESSAGE`.
  6. `User` already exists with that phone (any account state, including passwordless OTP-created ones) → 400 "هذا الرقم مسجّل مسبقاً. استخدم تسجيل الدخول." — this response implicitly confirms the phone number is registered (account-existence enumeration; same pattern login avoids with its generic message).
  7. `hashPassword` (scrypt) → creates `User` with `role: "CUSTOMER"` (registration can never create an ADMIN/PARTNER account).
  8. Immediately creates a session (same JWT/cookie mechanism as login, 30-day expiry) — **registration logs the user in with no separate email/phone confirmation step.**
  9. Merges guest cart and guest checkout address into the new user, same as login.
  10. Returns `{ userId, role: "CUSTOMER" }` with message "تم إنشاء الحساب وتسجيل الدخول".

## States
- [ ] Empty state — n/a.
- [ ] Loading state — `Suspense` fallback (`animate-pulse h-80` card) while `useSearchParams()` resolves; per-submit `loading` disables the active step's primary button and swaps label ("جاري إنشاء الحساب…" on the profile step; the phone step's "متابعة" has no loading variant since it never hits the network).
- [ ] Error state — destructive toasts only, no inline per-field error text; a thrown/network exception shows "خطأ في الاتصال".
- [ ] Permission-restricted state — n/a; page has no auth guard at all (see above), so there's no restricted variant to preserve, but note this is itself a gap versus login's guard.

## Edge cases
- [ ] Logged-in user opens `/register` → form still renders and is fully usable (no redirect), unlike `/login`. Submitting it would still attempt to create a second account tied to the same or a different phone.
- [ ] Non-Egyptian / malformed phone typed at the "phone" step is accepted and lets the user proceed to "profile" — the rejection only happens at final submit (400 from the server), sending the user back with a toast but **still on the profile step**, with the invalid phone silently retained in state (their only way back is the explicit "تغيير الرقم" button).
- [ ] Registering a phone number that already exists (regardless of whether that existing account has a password) always fails with "already registered" — including for phone numbers that only exist because of the (unreachable-from-UI) OTP-based `verifyOtp`/`otp/verify` route, which auto-creates a passwordless `User`. Such an account can neither log in (no password) nor re-register (phone taken) through the current UI — a real dead-end if any such rows exist in production.
- [ ] Password/confirm mismatch, or password < 8 chars, blocked client-side before any network call; server re-validates the same rule independently (defense in depth, not redundant given direct API access).
- [ ] Email left blank → sent as `undefined` in the JSON body, server stores `null`. Email format is never validated anywhere in this flow.
- [ ] `?redirect=` handling is looser than login's: any string starting with `/` is honored, including `"//attacker.example"` (protocol-relative — a browser will treat this as an external host). This is a real open-redirect inconsistency between the two forms worth flagging to PM/eng even though it's out of scope to silently "fix" as part of a UI-parity rebuild.
- [ ] Rapid double-submit only guarded by the button's `disabled={loading}`; no server-side idempotency or rate limiting on `/api/auth/register` (a scripted client could hammer this endpoint; also enables the account-existence enumeration noted above at volume).
- [ ] JS-disabled — same as login, entire flow is client-rendered; no-JS users get a non-functional form.

## Notes
- The "phone → profile" two-step UI has **no OTP/verification step between them** despite the OTP infrastructure (`lib/auth/otp.ts`, including a purpose-built `verifyOtpForRegistration` function) existing in the codebase and even having a dedicated function for this exact use case. `verifyOtpForRegistration` is defined but has zero callers anywhere in the app — it is dead code, apparently left over from a prior registration design that verified the phone via SMS before account creation. Registration today is phone-number-claimed-on-trust, not phone-number-verified.
- Because of the above, "phone-number-based accounts with OTP verification (Twilio) for login/register" (stated as background context for this task) does **not** match current register/login behavior — OTP is live and wired only inside the forgot-password flow (see `forgot-password.md`). Flag this to the PM/business owner: either the redesign should keep the current no-OTP-at-registration behavior (parity), or this is a known gap the business wants closed as part of/alongside the redesign — that's a product decision, not something to guess at here.
- Field order in the "profile" step is fixed: name → email → password → confirm-password → submit → "change number". Preserve this order; it affects tab order and perceived form length.
- Shares the same `app/(auth)/layout.tsx` centered-card shell as login and forgot-password.
