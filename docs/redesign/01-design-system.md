# Redesign — design system brief

This is the brief for the Claude Design canvas (the `design` skill). Not yet built — this file is the input to that step.

## Foundation (tokens)

- Color scale: brand primary/secondary, neutrals, semantic (success/warning/danger/info), all with light-mode values at minimum (dark mode: decide per `03-backlog.md` when scheduled).
- Type scale: must support Arabic (RTL) as the primary script — pick a typeface with solid Arabic glyph support, not a Latin font with Arabic as an afterthought. Define a Latin fallback for the rare LTR content (SKUs, phone numbers, prices).
- Spacing, radii, elevation/shadow, motion/transition scale.
- All tokens land in `tailwind.config.ts` once approved — the canvas is the design source of truth, Tailwind config is the code source of truth, they must stay in sync.

## Core components (build once, reuse across all four surfaces)

Starting point is what already exists in `components/ui` (button, card, dialog, input, label, select, table, badge, toast) — redesign these, then add what's missing:
dropdown-menu, tabs, popover, tooltip, checkbox, radio-group, switch, form (react-hook-form wrapper), pagination, empty-state, data-table (TanStack Table shell), stat/metric tile, notification/toast center.

## Representative screens (one per surface, prove the system before rolling out everywhere)

- **Auth**: login screen (phone + password, OTP step)
- **Public storefront**: product detail page (PDP) — variants, images, add-to-cart
- **Partner portal**: partner dashboard/orders list — data-table-heavy
- **Admin**: products or orders table view — data-table-heavy, filters, bulk actions

## Mobile-first

Design every artboard mobile-first, not desktop-scaled-down — assume most storefront traffic is on a phone unless Phase 2's baseline data says otherwise. Define the actual breakpoint scale (not just "responsive" as a vague intent) as part of the tokens above, and every representative screen below gets a mobile artboard, not just desktop.

## Accessibility is a requirement, not a nice-to-have

Bake this in now, while components are being built fresh — retrofitting later is expensive. Radix primitives already give a solid baseline (focus management, ARIA roles); don't undo that with custom styling. Concretely: color tokens must meet WCAG AA contrast (both light and any future dark mode), every interactive element has a visible focus state and is keyboard-reachable, form fields have real labels (not placeholder-as-label), and icon-only buttons get an accessible name. `ui-verifier` checks this per screen.

## RTL is not optional

Every artboard must be designed RTL-first (this is an Arabic-first storefront per the README) — mirror layout, icon direction, and text alignment. LTR is the fallback case here, not the default.

## Canvas link

_(fill in once the canvas is published)_
