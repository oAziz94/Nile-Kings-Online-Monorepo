# (auth) — Forgot password

Route(s): `app/(auth)/forgot-password` → `/forgot-password`
Key files: `app/(auth)/forgot-password/page.tsx`, `app/(auth)/layout.tsx`, `app/api/auth/forgot-password/request/route.ts`, `app/api/auth/forgot-password/verify/route.ts`, `app/api/auth/forgot-password/reset/route.ts`, `lib/auth/forgot-password.ts`, `lib/auth/otp.ts`, `lib/redis/otp-limits.ts`, `lib/settings.ts` (`getOtpRules`), `lib/auth/password.ts`, `lib/phone.ts`, `lib/country-codes.ts`

## Business requirements
- **Goal/KPI**: retention/account-recovery — a customer locked out of a password-based account (the only login method today, see login.md) must be able to self-serve a reset without a support ticket; every extra step or unclear error here risks an abandoned recovery and a lost/annoyed returning customer.
- **Trust/credibility signals**: real SMS OTP via Twilio (not a fake/simulated code), a short-lived (15 min) signed reset token gating the final password-set step so the OTP can't be replayed indefinitely, explicit resend cooldown countdown so the user knows the system is working rather than silently failing.
- **Friction points (observed in code)**:
  - `ADMIN` accounts are explicitly blocked from self-service password reset here ("لا يمكن استعادة كلمة المرور لهذا الرقم") — by design, but the message doesn't explain what an admin should do instead (support/ops channel presumably outside this screen's scope).
  - Accounts with no `passwordHash` (i.e., created via the dead OTP-only login path, if any exist) are told "لا يوجد حساب بهذا الرقم أو الحساب لا يستخدم كلمة مرور" — a dead end identical to the one described in login.md/register.md.
  - Same country-code-dropdown-vs-Egypt-only-validation mismatch as login/register.
  - Multi-step flow (phone → OTP → new password) with no visible step indicator/progress UI beyond the changing form content.
- **Compliance/legal**: OTP codes are stored only as a salted SHA-256 hash (`hashOtp`, never the raw code) in `OTPRequest`, with a separate append-only `OtpAuditLog` (event/outcome/ip) for traceability — reasonable practice for a flow that touches account recovery.
- **Modern-look rationale**: segmented 6-box OTP input with auto-advance/auto-backspace and paste support is a now-standard SMS-OTP UX pattern (vs. a single text field) — worth preserving as a UX expectation, not just decoration.

## Elements & behavior
- [ ] **No server-side auth guard** — the whole page is a client component (`"use client"` at the top of the file, no wrapping server check); an already-logged-in user can still open `/forgot-password` and run the flow (would reset their own account's password).
- [ ] **Step "phone"**:
  - Layout order is **select-then-input** (country code `<select>` first, phone `Input` second) — the reverse of login/register's input-then-select order.
  - Phone `Input`: `type="tel"`, placeholder `1xxxxxxxxx`, `dir="ltr"`, `autoComplete="tel-national"`.
  - "إرسال رمز التحقق" (Send verification code) submit button, `disabled` while `loading`, label swaps to "جاري الإرسال…".
  - `handleRequestOtp`: empty phone → destructive toast "أدخل رقم الجوال", stop. Otherwise `POST /api/auth/forgot-password/request` with `{ phone }`.
    - Non-OK → destructive toast with server message or fallback "فشل إرسال الرمز"; stays on phone step.
    - OK → advances to `step="otp"`, resets the 6 OTP digit boxes to empty, sets `resendCooldown` from `data.data.cooldownSeconds` (fallback 60s), toast "تم إرسال رمز التحقق" (description "تحقق من رسائلك."), and auto-focuses the first OTP box after 100ms.
- [ ] **Step "otp"**:
  - Shows "أدخل الرمز المرسل إلى {countryCode} {phone}" (echoes back exactly what was typed, not the server-normalized E.164 form).
  - 6 individual single-character inputs (`inputMode="numeric"`, `dir="ltr"` container), each auto-advances focus to the next box on digit entry, Backspace on an empty box moves focus to the previous box. Pasting a multi-digit string into any box distributes the digits starting at that index and moves focus to the last filled box (or the last box if the paste overflows).
  - Filled boxes get a `border-primary` highlight.
  - "تحقق ومتابعة" (Verify & continue) submit — `disabled` while `loading` OR while fewer than 6 digits are filled.
  - "إعادة إرسال الرمز" (Resend code) ghost button — `disabled` while `resendCooldown > 0` or `loading`; label shows "إعادة الإرسال بعد {n} ثانية" counting down every second (`setInterval`, 1s tick) while cooldown is active. `handleResend` re-calls the same `request` endpoint; on success resets `resendCooldown` from the new response (does **not** reset `loading` messaging beyond the normal button disable) and shows toast "تم إرسال رمز جديد".
  - "تغيير الرقم" (Change number) ghost button → back to `step="phone"` (OTP digits and resend cooldown are not explicitly cleared by this action in state, but the phone step is shown again).
  - `handleVerifyOtp`: if joined digits length !== 6 → destructive toast "أدخل الرمز المكون من 6 أرقام", stop (this should be unreachable given the button's disabled condition, but is still enforced). Otherwise `POST /api/auth/forgot-password/verify` with `{ phone, code }`.
    - Non-OK → destructive toast with server message or fallback "رمز غير صحيح"; stays on OTP step (digits are **not** cleared, user can correct and resubmit within the same request's attempt budget).
    - OK → stores `resetToken` from `data.data.resetToken`, advances to `step="password"`, toast "تم التحقق" (description "أدخل كلمة المرور الجديدة.").
- [ ] **Step "password"**:
  - New-password `Input` (`type="password"`, placeholder shows 8-char minimum, `autoComplete="new-password"`).
  - Confirm-password `Input` (same pattern as register).
  - "حفظ كلمة المرور" (Save password) submit, `disabled` while `loading`, label swaps to "جاري الحفظ…".
  - "العودة لتغيير الرمز" (Back to change the code) ghost button → back to `step="otp"` (does not re-request a code, just shows the OTP-entry UI again with whatever digits were last entered).
  - `handleSetPassword`: client validation in order — new password length < 8 → destructive toast (8-char message); mismatch with confirm → "كلمتا المرور غير متطابقتين"; missing `resetToken` in state → "انتهت الجلسة. أعد طلب استعادة كلمة المرور." (session/state was lost, e.g. page reload mid-flow — since `resetToken` lives only in React state, a refresh at this step always triggers this). Otherwise `POST /api/auth/forgot-password/reset` with `{ resetToken, newPassword }`.
    - Non-OK → destructive toast with server message or fallback "فشل تغيير كلمة المرور".
    - OK → success toast "تم تغيير كلمة المرور", `router.push("/login")` + `router.refresh()`. **Does not auto-login** the user (unlike register) — they land on the login form and must sign in with the new password.
- [ ] **"تذكرت كلمة المرور؟ تسجيل الدخول" link** (shown on every step) → `/login`.
- [ ] **"العودة للمتجر" link** (shown on every step) → `/`.
- [ ] **Server route `POST /api/auth/forgot-password/request`** (`requestPasswordResetOtp`):
  1. Malformed JSON → 400; missing phone → 400 "رقم الجوال مطلوب".
  2. `normalizeEgyptMobilePhone` fails → 400 `EGYPT_MOBILE_ERROR_MESSAGE`.
  3. User's `role === "ADMIN"` → 403 "لا يمكن استعادة كلمة المرور لهذا الرقم".
  4. No user, or user has no `passwordHash` → 400 "لا يوجد حساب بهذا الرقم أو الحساب لا يستخدم كلمة مرور".
  5. Delegates to `requestOtp(phone, ip, "forgot_password")` (shared OTP engine, see below) → same lock/cooldown/rate-limit precedence as the (otherwise-dead) login-OTP path, just tagged `purpose: "forgot_password"`.
  6. Success → 200 `{ cooldownSeconds }`, message "تم إرسال رمز التحقق إلى جوالك".
- [ ] **Server route `POST /api/auth/forgot-password/verify`** (`verifyPasswordResetOtp` → `verifyOtpForForgotPassword`):
  1. Missing phone/code → 400.
  2. Code normalized to digits, must be exactly 6 long, else "invalid".
  3. Checks phone-level lock (`otp:lock:{phone}` in Redis, 15 min default) → 429 "الحساب مؤقتاً مقفل. حاول بعد N دقيقة".
  4. Looks up the most recent `OTPRequest` row with `purpose: "forgot_password"` for that phone (separate lookup from the login/register purpose, so a forgot-password code and a login code — if the dead login path were ever used — never cross-validate).
  5. No such request → 400 "رمز التحقق غير صحيح" (`invalid`, generic — doesn't reveal "no request exists").
  6. Per-request `lockedUntil` in the future → 429 lock message.
  7. Expired (`expiresAt < now`) → 400 "انتهت صلاحية الرمز. اطلب رمزاً جديداً."
  8. Increments a Redis verify-attempt counter; once attempts exceed `maxVerifyAttempts` (default 5), sets both the DB row's `lockedUntil` and the Redis lock (default 15 min) → 429 "عدد المحاولات كبير. حاول لاحقاً."
  9. Hash mismatch → 400 "رمز التحقق غير صحيح" (same message as "no request", so a user cannot distinguish "wrong code" from "no code was ever requested").
  10. Success → clears verify-attempt counter, issues a signed reset JWT (`createResetToken`, issuer `nile-kings`, audience `nile-kings-password-reset`, 15-minute expiry, payload `{phone, purpose: "password_reset"}`) → 200 `{ resetToken }`.
- [ ] **Server route `POST /api/auth/forgot-password/reset`** (`resetPasswordWithToken`):
  1. Missing `resetToken` → 400 "رمز الاستعادة مطلوب".
  2. `newPassword` missing or < 8 chars → 400 (8-char message).
  3. Token invalid/expired/wrong-audience → 401 "انتهت صلاحية الرابط أو أنه غير صحيح. أعد طلب استعادة كلمة المرور." (note: message says "الرابط" — "the link" — a holdover phrasing from what may once have been an email/SMS-link-based reset rather than the current in-page token; today the token never appears as a URL, it's held only in client state).
  4. Token valid but no matching `User` for the embedded phone → 401 "الحساب غير موجود."
  5. Success → hashes and updates `passwordHash` on the user; **does not** invalidate any existing session/cookie for that user (no session revocation on password reset) and does not log the requester in. 200, message "تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن."

## States
- [ ] Empty state — n/a.
- [ ] Loading state — `Suspense` fallback (`animate-pulse h-80` card, identical shape to login/register) while the client component mounts; per-step `loading` disables that step's primary button with a "…" label. The OTP step's live countdown (`resendCooldown`) is a distinct, always-on loading-adjacent state independent of `loading`.
- [ ] Error state — destructive toasts for every failure path listed above (client validation and server error messages both surface identically as toasts); no inline per-field errors. Network/fetch exceptions show "خطأ في الاتصال" at every step.
- [ ] Permission-restricted state — the *account* can be permission-restricted (ADMIN phones are rejected, and passwordless accounts are rejected) but there is no page-level auth guard for the *visitor* — see above.

## Edge cases
- [ ] Requesting a reset for an ADMIN's phone number → always 403, regardless of correctness of the number, before any OTP is ever sent.
- [ ] Requesting a reset for a phone with no account, or an account with no password (OTP-only-created rows) → 400 "no account" — note this message is a single combined string that doesn't distinguish "phone never registered" from "registered but passwordless", which is intentional (avoids leaking which case applies) but should stay a single combined message in the rebuild.
- [ ] Resend before cooldown expires — client button is disabled, but the server independently enforces the same cooldown via Redis TTL (`otp:cooldown:{phone}`) and returns 429 if bypassed (e.g. a second browser tab, or direct API call) with "انتظر N ثانية قبل إعادة الإرسال".
- [ ] Exceeding 5 OTP requests for the same phone within a rolling hour → 429 "تجاوزت الحد المسموح من الطلبات لهذا الرقم" (`rate_limit_phone`, `PHONE_LIMIT_PER_HOUR = 5`).
- [ ] Exceeding 20 OTP requests from the same IP within a rolling hour (across any phone numbers) → 429 "تجاوزت الحد المسموح من الطلبات" (`rate_limit_ip`, `IP_LIMIT_PER_HOUR = 20`).
- [ ] Exceeding `maxVerifyAttempts` (default 5, admin-configurable via site settings) wrong-code submissions → both the specific `OTPRequest` row and the phone globally are locked for `lockMinutes` (default 15, admin-configurable) — even a *subsequently correct* code is rejected until the lock clears.
- [ ] Twilio send failure (any exception from the Twilio SDK call) → 400 "فشل إرسال الرسالة. حاول لاحقاً." and the failure is logged to `OtpAuditLog` with the raw Twilio error message as `outcome` — no code is stored/usable in this case.
- [ ] Code expires (default 10 minutes, admin-configurable) before verification → 400 "انتهت صلاحية الرمز. اطلب رمزاً جديداً." — user must go back to the phone step (or use "تغيير الرقم") and request a new code.
- [ ] Successful OTP verify but the user then **abandons the tab or refreshes** before submitting the new password → `resetToken` (held only in React state, never in a cookie/URL/localStorage) is lost; re-opening `/forgot-password` starts over from the phone step. There is a still-valid 15-minute reset JWT that simply becomes unreachable through the UI.
- [ ] Reset token expires (15 minutes) between OTP-verify success and the final password submit → 401 "انتهت صلاحية الرابط أو أنه غير صحيح..." on save, forcing a full restart from the phone step (no "your session expired, resend?" shortcut).
- [ ] Successfully resetting the password does **not** invalidate other active sessions for that account — if the account was compromised and someone else is already logged in elsewhere, they stay logged in after this flow completes.
- [ ] Pasting a 6+ digit string into any of the 6 OTP boxes correctly fans it out left-to-right starting at the focused box and clamps at the last box; pasting into box 4 with only 3 digits left fills boxes 4-6 and leaves focus on box 6 (`Math.min(index + digits.length, OTP_LENGTH - 1)`).
- [ ] JS-disabled — entire flow non-functional, same as login/register.

## Notes
- This is the **only** auth screen where OTP/Twilio is actually exercised today — login and register are both pure password flows (see their files' Notes). Any "OTP verification" business requirement stated for the app broadly should be understood as scoped to password recovery only, unless/until the dead `otp/request`+`otp/verify` endpoints are revived for login/register by a product decision.
- OTP rules (`expiryMinutes: 10`, `cooldownSeconds: 60`, `maxVerifyAttempts: 5`, `lockMinutes: 15` — all defaults in `lib/settings.ts`) are **admin-configurable at runtime** via site settings (`getOtpRules`/`setOtpRules`), not hardcoded constants — so the client's hardcoded `RESEND_COOLDOWN_SEC = 60` fallback is only used if the server response omits `cooldownSeconds`, which shouldn't normally happen. The rebuild should keep reading the cooldown from the server response rather than trusting the client constant.
- Field/step order quirk vs. login/register: this screen's phone step places the country-code `<select>` **before** the phone `Input`; login/register place the `Input` first. Preserve this exact ordering per-screen (not "fix" it into consistency) since the task is parity, not a design opinion — flag the inconsistency in `02-proposals.md` if a unified order is later desired.
- Shares `app/(auth)/layout.tsx` with login/register (centered `max-w-md` card).
