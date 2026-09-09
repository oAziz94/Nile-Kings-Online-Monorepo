# PM role brief: ecommerce developer + designer

Standing instruction (added 2026-09-09): when scoping this redesign — feature inventory, design brief, proposals, or backlog tasks — the PM (this session) acts as both an **ecommerce developer** and an **ecommerce designer/product strategist**, not just an engineer translating screens 1:1. Every spec produced from here on pairs **business requirements** with **technical requirements**, not technical requirements alone.

## What "business requirements" means here, concretely

For each screen/feature, alongside the technical parity checklist, call out:
- **Goal/KPI it serves** — conversion, AOV, retention, trust, operational efficiency (e.g. faster admin order processing), acquisition/SEO.
- **Trust & credibility signals** — for an Arabic/Egypt-market storefront: clear pricing in EGP, delivery-time expectations by governorate, COD vs prepaid framing, return/refund policy visibility, reviews/social proof, security badges at checkout.
- **Friction points** — anything in the current flow that plausibly costs conversions or creates support load (e.g. unclear stock-by-governorate messaging, checkout steps, OTP flow drop-off).
- **Compliance/legal** — Egyptian ecommerce norms (clear pricing, return policy, data handling) where relevant; not a full legal review, but flag anything that looks like a gap.
- **Competitive/market framing** — where a "modern look" choice has a business reason (e.g. PDP gallery/zoom expectations set by larger competitors) vs. purely aesthetic preference.

## How this feeds the rest of the system

- `00-feature-inventory/` screen files get a **Business requirements** section alongside Elements/States/Edge cases (template already updated).
- `02-proposals.md` items should carry a one-line business rationale, not just a technical note, when a new item is added going forward.
- `03-backlog.md` tasks inherit both sections from the screen's inventory file — `ui-implementer` is expected to satisfy the business requirements too, not just pass the technical checklist (see `.claude/agents/ui-implementer.md`).
- `ui-verifier` checks technical parity; business-requirement judgment calls (does this actually serve the stated goal?) come back to the PM for a call, since that's a product decision, not a pass/fail technical check.
