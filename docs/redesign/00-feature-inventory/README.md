# Feature inventory

One file per screen (or tight group of related screens), capturing exactly what the current UI does — this is the parity checklist `ui-implementer` must preserve and `ui-verifier` grades against. Written from the current code, not from the new design.

## Template for each screen file

Per the PM role brief (`../05-role-brief.md`), every screen file pairs a **business requirements** section with the technical one — not technical alone.

```markdown
# <Surface> — <Screen name>

Route(s): `app/(surface)/...`
Key files: components/..., lib/...

## Business requirements
- Goal/KPI this screen serves (conversion, AOV, retention, trust, ops efficiency, SEO, ...)
- Trust/credibility signals that must survive the redesign (pricing clarity, delivery expectations, COD/prepaid framing, policy visibility, ...)
- Known or plausible friction points in the current flow
- Compliance/legal considerations, if any
- Any business reason behind a "modern look" choice for this screen (vs. pure aesthetics)

## Elements & behavior
- [ ] <element> — <exact current behavior>

## States
- [ ] Empty state
- [ ] Loading state
- [ ] Error state
- [ ] Permission-restricted state (if role-gated)

## Edge cases
- [ ] <edge case> — <expected behavior>

## Notes
<anything non-obvious a rebuild could easily miss>
```

## Index

Screens to inventory, grouped by surface. Check off once a file exists for it.

### `(auth)`
- [ ] login
- [ ] register
- [ ] forgot-password

### `(public)`
- [ ] home
- [ ] categories / categories/[slug]
- [ ] products / products/[slug] (PDP)
- [ ] search
- [ ] cart
- [ ] checkout
- [ ] partners (become-a-partner request form)
- [ ] profile/account
- [ ] profile/addresses
- [ ] profile/orders
- [ ] profile/senior
- [ ] privacy / terms (static — low priority)

### `(partner)`
- [ ] partner dashboard/home
- [ ] partner/orders
- [ ] partner/routed-orders
- [ ] partner/products
- [ ] partner/restock-requests
- [ ] partner/distributors
- [ ] partner/distributor-requests
- [ ] partner/reports

### `(admin)`
- [ ] admin dashboard/home
- [ ] admin/products
- [ ] admin/categories
- [ ] admin/orders
- [ ] admin/routed-orders
- [ ] admin/partners
- [ ] admin/partner-inventory
- [ ] admin/rerouting-rules
- [ ] admin/coupons
- [ ] admin/shipping
- [ ] admin/clients
- [ ] admin/admins
- [ ] admin/analytics
- [ ] admin/settings
