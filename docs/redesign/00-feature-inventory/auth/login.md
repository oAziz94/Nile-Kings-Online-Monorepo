# (auth) — Login

Route(s): `app/(auth)/login` → `/login`
Key files: `app/(auth)/login/page.tsx`, `app/(auth)/login/login-form.tsx`, `app/(auth)/layout.tsx`, `app/api/auth/login/route.ts`, `lib/auth/session.ts`, `lib/auth/password.ts`, `lib/phone.ts`, `lib/country-codes.ts`, `lib/cart/cart.ts` (`mergeGuestCartIntoUser`), `lib/addresses/merge-guest-address.ts`

## Business requirements
- **Goal/KPI**: return-visitor conversion and retention — get an existing customer (or partner/admin) back into a checkout/account flow with minimal friction; a failed or confusing login is a direct drop-off point right before purchase.
- **Trust/credibility signals**: Arabic-first form (RTL page, LTR phone/OTP-style inputs), phone-number identity (matches how Egyptian shoppers actually identify themselves, not email), no third-party/social login — keeps the surface simple and avoids requiring an email account.
- **Friction points (observed in code)**:
  - The country-code dropdown offers 22 countries, but the server (`normalizeEgyptMobilePhone`) only ever accepts Egyptian mobile numbers (`010/011/012/015` + 8 digits) regardless of which country code is selected — picking any non-`+20` code will always fail server validation with the Egypt-specific error message. This is confusing UI surface that doesn't match backend capability today.
  - No client-side phone-format validation before submit — the first feedback a user gets on a malformed number is a server round-trip.
  - No password-login rate limiting/lockout (see Edge cases) — acceptable for now but a brute-force risk as the store grows.
  - Password-only login for an account originally created via the (currently unreachable) OTP-only path has no self-serve recovery other than "forgot password", and forgot-password itself refuses accounts with no `passwordHash` (see `forgot-password.md`).
- **Compliance/legal**: none specific found in this screen beyond standard credential handling (httpOnly session cookie, scrypt password hashing).
- **Modern-look rationale**: rounded-2xl card/inputs and toast feedback are purely aesthetic/consistency choices; no functional business driver tied to visual style on this screen.

## Elements & behavior
- [ ] **Server-side auto-redirect for already-logged-in users** (`page.tsx`, `dynamic = "force-dynamic"`) — before rendering the form, calls `getCurrentUser()`. If a session exists:
  - `userHasAdminAccess(user)` true (User.role === `ADMIN`) → `redirect("/admin")`.
  - else tries `requirePartner()` (looks up a `Partner` row where `userId === session.userId` OR `phone === session.phone`, and `isActive: true`) — on success → `redirect("/partner")`.
  - else (plain customer, or partner lookup threw) → `redirect("/")`.
  - This redirect is **only evaluated on a fresh server render of `/login`** (e.g. direct navigation/refresh); it is a distinct code path from the client-side post-submit redirect below.
- [ ] **Country-code select** — `<select>` of `COUNTRY_CODES` (22 entries, `lib/country-codes.ts`), default `+20` (Egypt). `dir="ltr"`, `aria-label="رمز الدولة"`.
- [ ] **Phone input** — `type="tel"`, placeholder `1xxxxxxxxx` (expects national number without leading 0), `dir="ltr"`, `autoComplete="tel-national"`. No maxlength/pattern enforced client-side; any non-digit characters typed are sent as-is (digits are stripped only when building the submit payload, not in the field itself).
- [ ] **Password input** — `type="password"`, placeholder "كلمة المرور", `autoComplete="current-password"`. No client-side length/complexity check on login (unlike register).
- [ ] **"نسيت كلمة المرور؟" (Forgot password?) link** — `<Link href="/forgot-password">`. Does not carry over the phone number typed so far.
- [ ] **Submit button "تسجيل الدخول"** — on click:
  1. `preventDefault`.
  2. Client checks: phone non-empty → else toast "أدخل رقم الجوال" (destructive) and stop; password non-empty → else toast "أدخل كلمة المرور" (destructive) and stop.
  3. Builds `full = countryCode + digits-only(phone)` and `POST /api/auth/login` with `{ phone, password }`.
  4. Button shows "جاري تسجيل الدخول…" and is `disabled` while `loading`.
  5. On non-OK response: destructive toast with `data.error.message` (server-provided Arabic message) or fallback "فشل تسجيل الدخول"; loading cleared, form stays as-is (fields are **not** cleared).
  6. On OK: success toast "تم تسجيل الدخول"; computes redirect target via `safeRedirect(searchParams.get("redirect"))` — only used if it starts with `/` and does not start with `//` or `/\` (open-redirect guard); if no valid explicit redirect, falls back to `homeForRole(data.data.role)` → `ADMIN`→`/admin`, `PARTNER`→`/partner`, else `/`. Then `router.push(target)` + `router.refresh()`.
- [ ] **"ليس لديك حساب؟ إنشاء حساب" link** → `/register`.
- [ ] **"العودة للمتجر" link** → `/`.
- [ ] **Server route `POST /api/auth/login`**:
  1. Parses JSON body; malformed JSON → 400 "جسم الطلب غير صالح".
  2. Missing phone or password → 400 "رقم الجوال وكلمة المرور مطلوبان".
  3. `normalizeEgyptMobilePhone(phone)` fails → 400 with `EGYPT_MOBILE_ERROR_MESSAGE` ("رقم الجوال يجب أن يكون رقم مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015").
  4. No `User` with that phone → 401 "رقم الجوال أو كلمة المرور غير صحيحة" (generic — does not reveal whether the phone exists).
  5. User exists but `passwordHash` is null (i.e., account was created through the OTP-only path) → 401 "هذا الحساب مسجّل بالتحقق برمز. أنشئ كلمة مرور من صفحة التسجيل أو استخدم إنشاء حساب." (message references a "create password from registration page" flow that does not currently exist in the register UI — see Notes).
  6. `verifyPassword` (scrypt, N=16384/r=8/p=1, timing-safe compare) fails → 401 same generic "رقم الجوال أو كلمة المرور غير صحيحة".
  7. Success: `createSession` signs a JWT (`HS256`, issuer `nile-kings`, audience `nile-kings-app`, 30-day expiry, payload `{sub: userId, phone, role}}`), sets it as httpOnly cookie `nile_session` (`secure` in production, `sameSite: lax`, `path: /`, `maxAge` 30 days). Then merges guest cart (`mergeGuestCartIntoUser`) and guest checkout-address cookie into the now-known user (`mergeGuestAddressIntoUser`). Returns `{ userId, role }`.

## States
- [ ] Empty state — n/a (form has no data-dependent empty state).
- [ ] Loading state — client `Suspense` fallback while `useSearchParams()` resolves: a pulsing skeleton card (`animate-pulse h-80`) matching the card shape; then per-submit `loading` state disables the submit button and swaps its label to "جاري تسجيل الدخول…".
- [ ] Error state — all errors surface as destructive `toast()` calls (see step 5 above and client validation); there is no inline field-level error UI (no red border/helper text under the specific input), only global toasts. A network/fetch exception (not an HTTP error) shows "خطأ في الاتصال".
- [ ] Permission-restricted state — n/a directly on this screen; the screen itself is public, but its *result* is role-gated (see auto-redirect logic above for already-authenticated users, and post-login redirect by role).

## Edge cases
- [ ] Already-logged-in ADMIN visits `/login` → hard server redirect to `/admin` (no form shown at all).
- [ ] Already-logged-in PARTNER (active `Partner` row) visits `/login` → hard redirect to `/partner`.
- [ ] Already-logged-in CUSTOMER (or partner whose `Partner.isActive` is false, or whose `Partner` row lookup throws) visits `/login` → hard redirect to `/`, not back to where they came from.
- [ ] Non-Egyptian phone number entered (any country code other than `+20`, or an Egyptian-looking number that fails the `^(10|11|12|15)\d{8}$` national check) → 400 with the Egypt-specific error message even if the user explicitly chose a different country in the dropdown.
- [ ] Account exists but was created via the (now unreachable in the UI) OTP-only flow, i.e. `passwordHash` is null → login always fails with a message pointing to a "create a password via registration" affordance that does not exist in the current register form (register blocks re-registration of an existing phone outright — see register.md). This is effectively a dead-end for such accounts through the UI today.
- [ ] Wrong password, any number of consecutive attempts → **no rate limiting, cooldown, or lockout** on `/api/auth/login` (unlike the OTP endpoints, which have phone/IP rate limits and a lock). Every failed attempt returns the same generic 401 message.
- [ ] `?redirect=` query param: only honored if it's a same-origin relative path (`starts with "/"`, not `"//"` or `"/\\"`); anything else silently falls back to the role-based home. An **invalid/missing** redirect target after a valid login still succeeds (redirect just falls back), it never blocks login.
- [ ] Submitting with the password field empty but phone filled (or vice versa) is caught client-side before any network call.
- [ ] Rapid double-submit — button is `disabled` while `loading`, but there's no additional debounce/idempotency key server-side beyond that UI guard.
- [ ] JS-disabled/no-JS — page fully depends on client component (`"use client"`) for submission; without JS the form does not submit anywhere (no `action`/`method` fallback).

## Notes
- The server-rendered "auto-redirect logged-in users off login page" (recent commit) and the client-side "where do I go after a successful login" logic are **two separate implementations** with different fallbacks: the server check has no `redirect=` awareness at all (always sends the customer fallback to `/`), while the client post-submit logic does honor `?redirect=`. A rebuild must preserve this asymmetry (or explicitly decide to unify it, which would be a behavior change).
- `homeForRole` (client) only recognizes `ADMIN` and `PARTNER` string role values coming back from the login API's `data.role`, which is the `User.role` column. `requirePartner()` (used for the server-side auto-redirect) instead checks the `Partner` table's `isActive` flag (matched by `userId` OR `phone`), **not** `User.role`. These two notions of "is this user a partner" can disagree if `User.role` and the `Partner` row ever drift out of sync — worth flagging to PM/eng, not something to silently "fix" during the redesign.
- Dead/unused code found while tracing this flow: `app/api/auth/otp/request/route.ts` and `app/api/auth/otp/verify/route.ts` (password-less, OTP-based login) exist and are fully wired end-to-end in `lib/auth/otp.ts`, including Twilio SMS send, Redis-backed cooldown/rate-limit/lockout, and auto-creating a `User` row on first successful OTP verify — but **no client code anywhere in the app calls either endpoint**. This looks like a superseded/former login method. It's not part of today's UI and should not be treated as in-scope for this screen's parity checklist, but the implementer should not "helpfully" resurrect it either without a PM decision.
- Toasts: `variant: "destructive"` for errors, `variant: "success"` for the final login toast, default/no-variant for nothing else on this screen. Toast stack limit is 3, auto-remove after 5s (`hooks/use-toast.ts`).
- Layout: `app/(auth)/layout.tsx` centers a `max-w-md` card on a `bg-muted/30` full-height background — shared by all three auth screens.
