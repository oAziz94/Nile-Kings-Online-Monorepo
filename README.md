# Nile Kings Online (نايل كينجز)

Nile Kings Online is the full-stack e-commerce platform powering **Nile Kings Cotton**, an Arabic (RTL), Egypt-focused online storefront for cotton apparel. It combines a customer-facing shop with a governorate-aware delivery/inventory network of partners (agents & distributors) and a full admin back office, and is built for the store's operations, marketing, and engineering teams.

## Features

- **Storefront** — Arabic RTL catalog with categories, product/variant browsing (size & color variants), search, filters, and home-page recommendations.
- **Cart & checkout** — guest and authenticated carts, coupon codes (percent, fixed, and "buy X get Y free" BOGO discounts), Cash-on-Delivery and InstaPay (prepaid) payment methods, and dynamic shipping-fee calculation.
- **Governorate-based delivery routing** — orders are automatically assigned to a partner (agent/distributor) based on the customer's governorate using configurable, round-robin routing rules, with partners notified over WhatsApp (Meta Cloud API).
- **Partner-owned inventory network** — each partner maintains its own stock per product variant, with a full inventory ledger (reserve/commit/release/transfer), restock requests between partners, and storefront stock that reflects the partner assigned to the shopper's governorate.
- **Partner registration** — public "become an agent/distributor" request form, with an admin workflow to review, contact, and convert requests into active partners (including linking distributors to agents).
- **Authentication** — phone-number based accounts with password login, OTP (one-time password) login/verification, and forgot-password flow; JWT session stored in an httpOnly cookie.
- **Senior citizen verification & promotions** — Egyptian National ID capture/verification (encrypted at rest) to unlock a senior-only "buy 2 get 1 free" promotion.
- **Admin dashboard** — management of products/variants, categories, coupons, shipping rules, orders, routed orders, partners & partner inventory, restock requests, rerouting rules, site settings, admins, and clients.
- **Analytics** — product view and add-to-cart event logging, an admin analytics dashboard, and Meta Pixel / Vercel Analytics integration on the storefront.
- **Order lifecycle & auditing** — order status pipeline (created → confirmed → processing → ready to ship → shipped → delivered / cancelled), audit logs for order and OTP events, and courier export (Egypt Post) tooling.
- **Image uploads** — Cloudinary-backed uploads for product images and delivery proof-of-drop images.
- **Transactional email** — partner-request and order notifications via Resend, with an SMTP fallback.
- **Operational scripts** — CLI scripts (via `tsx`) for inventory audits, reserved-stock rebuilds, and partner-inventory backfill/verification.

## Tech Stack

**Frontend**
- [Next.js 15](https://nextjs.org/) (App Router, React 19, Turbopack dev server)
- [Tailwind CSS](https://tailwindcss.com/) with `tailwindcss-animate`
- [Radix UI](https://www.radix-ui.com/) primitives (`react-slot`, `react-toast`)
- `class-variance-authority`, `clsx`, `tailwind-merge` for component styling
- `lucide-react` icon set
- `@vercel/analytics`

**Backend**
- Next.js Route Handlers (App Router `app/api/*`) as the API layer
- [Zod](https://zod.dev/) for request validation
- [jose](https://github.com/panva/jose) for JWT session signing/verification
- `libphonenumber-js` for phone parsing/validation (Egyptian numbers)
- `nodemailer` (SMTP) and `resend` for transactional email
- `twilio` for SMS/OTP delivery
- Meta WhatsApp Cloud API integration (custom service, no SDK) for partner order notifications
- `xlsx` for admin data export

**Database**
- [PostgreSQL](https://www.postgresql.org/) hosted on [Neon](https://neon.tech/) (serverless driver `@neondatabase/serverless`)
- [Prisma ORM](https://www.prisma.io/) (`@prisma/client`, `@prisma/adapter-neon`) for schema, migrations, and queries
- [Upstash Redis](https://upstash.com/) for caching/rate-limiting

**Other / Tooling**
- [Vitest](https://vitest.dev/) for unit tests
- TypeScript, ESLint (`eslint-config-next`)
- `tsx` for running TypeScript operational scripts
- Cloudinary for image hosting (via REST upload API)
- Deployed on [Vercel](https://vercel.com/)

## Architecture

The app is a single Next.js project using route groups to separate concerns:

- `app/(public)` — the customer storefront (catalog, cart, checkout, profile, legal pages)
- `app/(auth)` — login, registration, and password-recovery pages
- `app/(admin)` — the internal admin dashboard (products, orders, partners, routing rules, settings, etc.)
- `app/(partner)` — the partner portal, where agents/distributors manage their own inventory, orders, and restock requests
- `app/api` — Route Handlers backing all of the above, organized by domain (`admin/`, `partner/`, `auth/`, `checkout/`, `products/`, `promotions/`, `storefront/`, …)

Business logic lives in `lib/`, grouped by domain (`lib/checkout`, `lib/inventory`, `lib/rerouting`, `lib/shipping`, `lib/auth`, `lib/senior`, `lib/services`, …), keeping route handlers thin and logic testable/reusable between storefront, partner, and admin surfaces. Data access goes through a single Prisma client (`lib/db.ts`) against the Neon Postgres database; all monetary values are stored as integer piastres to avoid floating-point rounding errors.

**Location-based delivery & partner routing** is the platform's central design decision:

1. A shopper's governorate is captured (checkout address, or a storefront cookie set from their selection) and normalized against a fixed list of Egyptian governorates.
2. Each governorate can have an active `ReroutingRule`, which links an ordered list of active `Partner`s (agents/distributors) participating in round-robin assignment for that governorate.
3. **Storefront stock** reflects this routing *before* checkout: `lib/storefront-location.ts` resolves the current governorate to its rule's first partner and shows that partner's `PartnerInventory` levels (available minus reserved) instead of central stock, so shoppers only see what's actually deliverable to them.
4. **On checkout**, `assignOrderToGovernorate()` (`lib/rerouting/assign.ts`) re-resolves the rule for the order's shipping governorate, selects the next partner in round-robin order (advancing `lastAssignedPartnerId`), creates a `RoutedOrder` record, and notifies the partner via the Meta WhatsApp Cloud API (using an approved message template) — all inside a transaction, with WhatsApp delivery treated as best-effort so a notification failure never blocks the order.
5. If no rule exists or no partners are active for a governorate, the order is still created but marked `UNROUTED` for manual admin assignment.
6. Partner stock is adjusted through an append-only `InventoryLedger` (reserve on order, commit/release/restore as the order progresses, plus manual adjustments and inter-partner transfers via `RestockRequest`s), so stock levels are always reconstructable and auditable.

```
Shopper (governorate) → ReroutingRule → [Partner A, Partner B, …] (round-robin)
                              │
                              ├─ storefront: shows selected partner's PartnerInventory
                              └─ checkout:   assigns order → RoutedOrder → WhatsApp notify
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- A [Neon](https://neon.tech/) (or other Postgres) database
- npm (or another package manager compatible with the lockfile)

### Clone & Install

```bash
git clone https://github.com/oAziz94/Nile-Kings-Online-Monorepo.git
cd Nile-Kings-Online-Monorepo
npm install
```

### Environment Variables

Create a `.env` file in the project root with the following variables (names only — obtain real values from your own provider accounts):

```env
# Database (Neon Postgres via Prisma)
DATABASE_URL=
DIRECT_URL=

# Auth / security
JWT_SECRET=
ENCRYPTION_KEY=
CRON_SECRET=

# Site
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_CUSTOMER_SERVICE_PHONE=
NEXT_PUBLIC_WHATSAPP_NUMBER=
NEXT_PUBLIC_FACEBOOK_URL=

# Image uploads (Cloudinary)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Caching / rate limiting (Upstash Redis)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Transactional email (Resend, preferred)
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_FROM_NAME=
PARTNER_NOTIFICATION_EMAIL=

# Transactional email (SMTP fallback)
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
SMTP_EMAIL=
SMTP_FROM=
SMTP_FROM_NAME=

# SMS / OTP (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=

# WhatsApp partner notifications (Meta Cloud API)
WHATSAPP_API_URL=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ORDER_TEMPLATE_NAME=
WHATSAPP_ORDER_TEMPLATE_LANGUAGE=
```

### Database Setup

```bash
npm run db:generate   # generate the Prisma client
npm run db:push       # push the schema to your database (or `db:migrate` for migrations)
npm run db:seed       # optional: seed sample data
```

### Run Locally

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

Other useful scripts: `npm run test` (Vitest), `npm run lint`, `npm run build`, `npm run db:studio` (Prisma Studio).

## Project Structure

```
app/
  (public)/        # Customer storefront: catalog, cart, checkout, profile, legal
  (auth)/           # Login, registration, forgot-password
  (admin)/          # Admin dashboard (products, orders, partners, routing, settings)
  (partner)/        # Partner portal (inventory, orders, restock requests)
  api/               # Route Handlers for all domains above
components/
  storefront/, ui/, admin/, shared/   # UI components by domain
contexts/            # React context providers (e.g. cart)
hooks/               # Shared React hooks
lib/
  auth/, checkout/, inventory/, rerouting/, shipping/, senior/, services/  # Business logic by domain
  db.ts, env.ts       # Prisma client and typed environment config
prisma/
  schema.prisma       # Full data model (users, catalog, orders, partners, routing, inventory)
  seed.ts              # Seed script
public/               # Static assets (logos, hero images, QR codes)
scripts/               # Operational CLI scripts (inventory audits, backfills)
docs/                  # Feature implementation notes
```

## Live Demo

[https://nilekingscotton.com](https://nilekingscotton.com)

## License

This project is licensed under the [MIT License](LICENSE).
