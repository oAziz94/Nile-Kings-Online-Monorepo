# Public — Profile / Account

Route(s): `app/(public)/profile/page.tsx` (index redirect), `app/(public)/profile/layout.tsx` (shared shell), `app/(public)/profile/profile-nav.tsx`, `app/(public)/profile/account/page.tsx`
Key files: `app/api/profile/account/route.ts`, `lib/auth/session.ts` (`getCurrentUser`, `requireCustomer`), `lib/auth/password.ts` (`verifyPassword`/`hashPassword`), `lib/senior/verify.ts` (`getSeniorStatus`), `lib/api/parse-json.ts`

## Business requirements
- **Goal/KPI**: self-service account management — lets a logged-in customer update display name/email and change password without contacting support, reducing support load. The customer's true login identity is their **phone number** (verified via OTP at registration), which this screen deliberately keeps read-only.
- **Trust/credibility**: the phone field is rendered as a disabled `Input` — a clear (if silent) signal that phone = fixed account identity; there is no self-service phone-change flow anywhere in this route or its API.
- **Friction points**:
  - Email is optional and completely unvalidated (no format check client- or server-side beyond `typeof === "string"`, no verification email sent) — any string is accepted and stored.
  - Password change requires the current password; there is no "forgot password while logged in" shortcut and no strength meter beyond an 8-character minimum.
  - The account API returns `seniorVerified`/`nationalIdLast4`, but this page **never renders either field** — a senior-discount-verified customer gets no confirmation of that status here (see `profile-senior.md`, which is the only screen that shows it, and which is itself unreachable from navigation).
- **Compliance**: password changes are gated by re-verifying the current password server-side (`verifyPassword`) before allowing the update — no additional OTP/2FA step for sensitive changes (email or password) on this screen.
- Auth-gated page; not relevant to public SEO. `[NEEDS PM INPUT: confirm profile routes are excluded from indexing/sitemap — no explicit noindex directive was found on this route during this review.]`

## Elements & behavior
- [ ] `/profile` (index) — pure server-side redirect, no UI: if `getCurrentUser()` is null → `redirect("/login?redirect=/profile")`; otherwise → `redirect("/profile/account")`. There is no standalone "overview/dashboard" screen.
- [ ] `ProfileLayout` (wraps account/addresses/orders/senior) — server component; redirects unauthenticated visitors to `/login?redirect=/profile` before rendering anything. Renders a two-column layout: sticky sidebar `ProfileNav` on desktop (`md:w-56`), horizontally scrollable nav on mobile, main content to the right.
- [ ] `ProfileNav` — exactly 3 links: طلباتي → `/profile/orders`, عناويني → `/profile/addresses`, حسابي → `/profile/account`. **`/profile/senior` is not included.** Active-state matching: `pathname === href` or `pathname.startsWith(href)` (excluding the bare `/profile` root).
- [ ] On mount, the account page `GET`s `/api/profile/account` with `credentials: "include"`. A `401` triggers a **hard redirect** (`window.location.href = "/login?redirect=/profile/account"`) — this is a client-side fallback on top of the layout's own server-side redirect (relevant if the session cookie expires between initial render and this fetch). Response populates `profilePhone`, `name`, `email` local state (`seniorVerified`/`nationalIdLast4` are typed in the response but never stored/used).
- [ ] Card 1 — "بيانات الحساب" (account info):
  - الاسم — text `Input`, no client `maxLength`; required on submit (trimmed length must be ≥2, else a destructive toast "الاسم مطلوب (حرفان على الأقل)" and the submit is aborted before any request).
  - البريد الإلكتروني (اختياري) — `Input` with a mail icon, `dir="ltr"`; no format validation anywhere.
  - رقم الجوال — disabled `Input`, pre-filled, `dir="ltr"`; not editable.
  - Submit "حفظ التعديلات" — disabled while `profileSaving`; label becomes "جاري الحفظ…" in flight. `PATCH /api/profile/account` with `{ name, email }` (`email: null` if blank). On success: toast "تم تحديث بيانات الحساب" only — the client does **not** re-sync local `name`/`email` state from the PATCH response, it just trusts what was already typed.
- [ ] Card 2 — "تغيير كلمة المرور" (change password), a fully independent form:
  - كلمة المرور الحالية / كلمة المرور الجديدة (≥8 chars) / تأكيد كلمة المرور الجديدة — all required password inputs.
  - Client checks: all three non-empty; new password ≥8 chars; new password matches confirmation — each violation shows a distinct destructive toast and aborts before any request.
  - Submit "تغيير كلمة المرور" — disabled while `passwordSaving`; label "جاري التغيير…" in flight. `PATCH /api/profile/account` with `{ currentPassword, newPassword, newPasswordConfirm }` (same endpoint as the info form; server distinguishes intent by which fields are present — `wantsPasswordChange` is true if any of the three password keys exist). On success: toast "تم تغيير كلمة المرور بنجاح" and all three fields are cleared.
  - Server re-checks the same three rules, then loads the stored `passwordHash` and calls `verifyPassword(currentPassword, hash)`; wrong current password → 401 "كلمة المرور الحالية غير صحيحة". If the account has **no** `passwordHash` at all (e.g. an OTP-only account that never set one), the server returns "لا يوجد كلمة مرور لهذا الحساب. استخدم صفحة استعادة كلمة المرور." — explicitly redirecting the user (via copy, not an actual link) to the separate forgot-password flow.
- [ ] The two forms never interact — submitting one leaves the other's fields untouched, and both hit the identical PATCH endpoint via mutually exclusive server-side branches based on payload shape.

## States
- [ ] Empty state — not applicable; an account record always exists for a logged-in user.
- [ ] Loading state — while `loading` is true, only `<h1>حسابي</h1>` + "جاري التحميل…" text renders (no skeleton layout, no spinner icon); both cards only mount once the fetch resolves (success or failure — `finally` always flips `loading` to false).
- [ ] Error state — a thrown/network fetch error triggers a destructive toast "خطأ في التحميل", but the page still renders the (blank) form afterward since `loading` becomes false regardless of outcome. A non-401, non-success JSON response (e.g. malformed body) is silently ignored — no toast, fields simply stay blank.
- [ ] Permission-restricted state — enforced twice independently: server-side in `ProfileLayout` (redirect before render) and client-side on a `401` from the account `GET` (hard redirect). The `PATCH` endpoint also independently checks `requireCustomer()` and returns a JSON 401 if the session is missing.

## Edge cases
- [ ] Name shorter than 2 trimmed characters — blocked entirely client-side, no request sent.
- [ ] New password identical to the current one — not specially checked; allowed as long as current-password verification and the ≥8-char/match rules pass.
- [ ] Updating only name or only email — server includes `name` in the update only if provided; `email` is **always** included in the update payload (even as `null` when cleared), since the client always sends both keys.
- [ ] Account with no password set attempting a password change — explicit Arabic message redirects them (via text, not a link) to the forgot-password flow rather than a generic failure.
- [ ] Session expires mid-visit: the `GET`'s `401` hard-redirects via `window.location.href`, but a `PATCH`'s `401` (e.g. token expired after the page already loaded) is only shown as a generic toast ("يجب تسجيل الدخول") with **no redirect** — inconsistent handling between the two request types on this same screen.
- [ ] Concurrent edits from two tabs/devices — no optimistic-lock/version check; the last successful `PATCH` wins silently.

## Notes
- Phone number is permanently read-only on this screen; no phone-change self-service flow was found anywhere in the reviewed code (`[NEEDS PM INPUT: confirm whether an admin-side phone-change flow exists elsewhere, or whether this is genuinely unsupported]`).
- `seniorVerified`/`nationalIdLast4` are fetched here but never displayed — cross-reference `profile-senior.md`, the only screen that surfaces this status to the customer (and which itself is not linked from `ProfileNav`).
- `/profile` has no real UI of its own (pure redirect); a genuine profile "overview/dashboard" would be net-new scope for the redesign, not parity — flag as a proposal if desired, not a parity requirement.
