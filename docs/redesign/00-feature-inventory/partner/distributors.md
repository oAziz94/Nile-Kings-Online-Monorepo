# Partner — Distributors (agent's roster of linked distributors)

Route(s): `app/(partner)/partner/distributors/page.tsx` (client component)
Key files: `app/api/partner/distributors/route.ts` (GET)

## Business requirements
- **Goal/KPI**: gives an AGENT a single read-only roster of every DISTRIBUTOR linked beneath them in the partner hierarchy, with contact info and an at-a-glance inventory summary — supports relationship management and quick "who do I call" lookups without needing the admin panel.
- **Trust/credibility signals**: each distributor's active/disabled status is shown as a colored badge (نشط/معطّل) so the agent immediately knows which of their distributors are currently operating; inventory totals (available/reserved/sellable) give a lightweight sanity check on stock distribution across the agent's downstream network.
- **Friction points**: this is a pure read-only directory — there is no action from this screen (no "message," no "edit," no "deactivate," no drill-down into a distributor's own detailed inventory beyond the three aggregate numbers shown). An agent wanting to actually adjust a distributor relationship or dig deeper has to go elsewhere (or nowhere, if no such admin-mediated flow exists — `[NEEDS PM INPUT: is there any partner-facing way to link/unlink a distributor, or is that purely an admin-side action?]`).
- **Compliance/legal**: displays each distributor's phone number, email, and social/contact links — internal B2B contact data, not customer PII, but still worth keeping partner-scoped (an agent should only ever see distributors linked to *them*, never another agent's roster — confirmed server-side, see below).
- **Modern-look rationale**: none specific — a straightforward directory table.

## Elements & behavior
- [ ] **Role/ownership gate**: `requirePartner()` + explicit `Partner.partnerType === "AGENT"` check (403 "هذه الصفحة متاحة للوكلاء فقط" / "this page is for agents only" otherwise). **Ownership**: query is always `where: { linkedAgentId: user.partnerId, partnerType: "DISTRIBUTOR" }` — an agent only ever sees distributors linked to their own partner id, never another agent's downstream distributors.
- [ ] `PageHeader` — title "الموزعون"; description "الموزعون المرتبطون بحسابك وبيانات التواصل والمخزون المختصر."; `StatusBadge` "وكلاء فقط" (agents only); "تحديث" refresh button.
- [ ] **Table columns**: الاسم (name) · المحافظة (governorate) · الهاتف (phone, `dir="ltr"`, monospace) · البريد (`user.email`, "—" if the distributor has no linked `User` account or no email set) · التواصل (a row of text links for every non-null contact URL among `facebookUrl/instagramUrl/tiktokUrl/youtubeUrl/websiteUrl/otherUrl`, each opening in a new tab; renders bare "—" only if literally none of the six are set) · المخزون (three stacked lines: متاح/محجوز/قابل للبيع — see aggregation below) · الحالة (`isActive` → "نشط"/"معطّل" badge) · تاريخ الربط (`createdAt` of the distributor's `Partner` row, i.e. when that distributor account was created — not necessarily when the link to this agent was established, since `linkedAgentId` could theoretically change after creation).
- [ ] **Inventory totals per distributor**: computed server-side by summing that distributor's **entire** `PartnerInventory` table (`available = Σ stockAvailable`, `reserved = Σ stockReserved`, `sellable = max(0, available − reserved)`) across **all** variants they stock — not filtered to variants the agent themself also carries, so this can include stock the distributor received from other sources.
- [ ] **Sort order**: `isActive: "desc"` then `createdAt: "desc"` — active distributors first, newest-linked first within each group. No client-side sort/re-sort control.
- [ ] No search, no filter, no pagination on this screen (single unpaginated `findMany`, however many distributors the agent has).

## States
- [ ] Empty state — agent has zero linked distributors: `EmptyState` "لا يوجد موزعون مرتبطون بعد".
- [ ] Loading state — full-page centered spinner + "جاري تحميل الموزعين" (blocks the whole page on initial load, no partial/skeleton table).
- [ ] Error state — load failure: destructive toast ("فشل تحميل الموزعين" + error message when available for thrown exceptions, or the server's `error.message` for a resolved-but-unsuccessful response); table left empty/stale.
- [ ] Permission-restricted state — a DISTRIBUTOR (or any non-AGENT) hitting this URL directly: no client-side guard on the page itself; the API 403s and the failure path above fires (destructive toast, empty table) — **not** a distinguishable "you don't have access" message, just the generic load-failure toast. Also moot in normal navigation since this route isn't in the DISTRIBUTOR nav at all.

## Edge cases
- [ ] Distributor with no linked `User` account (`user: null`) — email column renders "—"; nothing else on the row is affected (name/phone/governorate/contact links/inventory/status all come from the `Partner` row itself, not the `User`).
- [ ] Distributor with `isActive: false` — still listed (not hidden), just sorted after active ones and badged "معطّل"; their inventory totals are still computed and shown normally (no visual de-emphasis of the whole row beyond the status badge itself).
- [ ] A distributor whose `linkedAgentId` was reassigned away from this agent after being created — would simply disappear from this agent's list on next load (the query is always a live lookup by current `linkedAgentId`, no historical/point-in-time view).
- [ ] Very large distributor roster — no pagination exists; a large list renders as one long scrollable table (horizontal scroll wrapper present via `overflow-x-auto`, but no vertical virtualization or page-size control).

## Notes
- This is one of the simplest partner screens functionally — pure read-only reporting, zero mutating actions, zero query params. A rebuild should resist the temptation to add interactivity (edit/deactivate/message) unless the PM explicitly scopes that in as a new feature — current parity target is "read-only roster."
- "تاريخ الربط" (link date) is labeled as if it reflects *when the agent-distributor link was formed*, but the underlying data (`Partner.createdAt`) is actually *when the distributor's account itself was created* — these are the same moment for the (presumably common) case of a distributor created already-linked to an agent, but would diverge if a distributor were ever relinked to a different agent later (no separate "linked at" timestamp exists in the schema to distinguish this). Preserve the current label/data mapping as-is; flag the semantic gap for the PM rather than silently "fixing" it.
- Contact-link columns render every URL field as a plain text hyperlink with a fixed label ("Facebook", "Instagram", "TikTok", "YouTube", "Website", "Other") regardless of the URL's actual content — no icon-only compact variant currently exists here (contrast with how social links might be presented elsewhere in the app; check before assuming icon-button treatment is safe to introduce without confirming these link labels/order should be preserved).
