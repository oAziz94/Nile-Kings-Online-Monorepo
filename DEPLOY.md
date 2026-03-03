# Deploying Nile Kings Online

This guide covers deploying the Next.js app to **Vercel** with **Neon** (database), **Cloudinary** (images), **Twilio** (OTP), **Upstash Redis**, and your **GoDaddy** domain (`nilekingsonline.com`).

---

## 1. Prerequisites (already set up)

- **Neon** – Postgres connection strings (pooled + direct)
- **Cloudinary** – Cloud name, API key, API secret
- **Twilio** – Account SID, Auth Token, “From” phone number
- **Upstash Redis** – REST URL and token (rate limiting, cooldowns)
- **GoDaddy** – Domain `nilekingsonline.com` (DNS will point to Vercel)

---

## 2. Deploy to Vercel

### Option A: Deploy with Vercel CLI

1. Install Vercel CLI (if needed):
   ```bash
   npm i -g vercel
   ```
2. From the project root, log in and deploy:
   ```bash
   vercel login
   vercel
   ```
3. Follow prompts (link to existing project or create new).
4. For production:
   ```bash
   vercel --prod
   ```

### Option B: Deploy via GitHub

1. Push the repo to GitHub (ensure `.env` is **not** committed).
2. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**.
3. Import the repo and leave **Framework Preset**: Next.js.
4. **Root Directory**: leave as `.` (repo root).
5. **Build Command**: `npm run build` (default).
6. **Output Directory**: leave default.
7. **Install Command**: `npm install` (default).
8. Do **not** deploy yet; add environment variables first (Step 3).

---

## 3. Environment variables on Vercel

In Vercel: **Project → Settings → Environment Variables**. Add every variable for **Production** (and optionally Preview). Use the same names as in `.env.example`; **never** commit real values.

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Neon **pooled** connection string | Yes |
| `DIRECT_URL` | Neon **direct** (non-pooled) connection string | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST API URL | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | Yes |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | Yes |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | Yes |
| `TWILIO_FROM` | Twilio “From” phone (e.g. +1234567890) | Yes |
| `JWT_SECRET` | Auth secret (min 16 characters) | Yes |
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes), e.g. `openssl rand -hex 32` | Yes |
| `CRON_SECRET` | Secret for cron job protection | Yes |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Yes |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes |
| `NEXT_PUBLIC_SITE_URL` | Public site URL, e.g. `https://nilekingsonline.com` | Yes |

- Get **Neon** URLs from Neon dashboard: **Connect** → connection string; use **pooled** for `DATABASE_URL`, **direct** for `DIRECT_URL`.
- **Security**: Generate a new strong `JWT_SECRET` and `CRON_SECRET` for production; do not reuse dev values.

---

## 4. Database migrations (Neon)

Migrations must be run against the **production** Neon database. Use the same `DATABASE_URL` / `DIRECT_URL` you set on Vercel.

**Option A – From your machine (with env pointing at prod):**

```bash
# Ensure .env has production DATABASE_URL and DIRECT_URL, then:
npx prisma migrate deploy
```

**Option B – From Vercel (Build step):**

Add a **Build Command** in Vercel that runs migrations before build, e.g.:

```bash
npx prisma generate && npx prisma migrate deploy && npm run build
```

(Only do this if the build has access to `DATABASE_URL`/`DIRECT_URL` and you want migrations on every deploy.)

**Optional seed (one-time):**

```bash
npm run db:seed
```

Run only once against production if you need initial data; ensure the seed script is safe for production.

---

## 5. Connect GoDaddy domain to Vercel

1. In Vercel: **Project → Settings → Domains**.
2. Add domain: `nilekingsonline.com` (and optionally `www.nilekingsonline.com`).
3. Vercel will show the required DNS records (e.g. A record or CNAME).
4. In **GoDaddy**: **My Products → DNS** for `nilekingsonline.com`.
5. Add/update records as Vercel instructs, for example:
   - **A** record: `@` → Vercel’s IP (e.g. `76.76.21.21`), or
   - **CNAME** record: `www` → `cname.vercel-dns.com`.
6. Set `NEXT_PUBLIC_SITE_URL` on Vercel to `https://nilekingsonline.com` (no trailing slash).
7. Wait for DNS propagation (minutes to 48 hours). Vercel will issue SSL automatically.

---

## 6. Cron job (release expired reservations)

- **Path**: `/api/cron/trigger-release-reservations` (called by Vercel Cron every 5 minutes).
- **Config**: Already in `vercel.json`; no change needed.
- **Security**: Set `CRON_SECRET` in Vercel. The cron route uses it to call `/api/jobs/release-expired-reservations`; do not expose this secret in the client or in `vercel.json`.

Cron runs only on **production** deployments.

---

## 7. Post-deploy checklist

- [ ] All env vars set in Vercel (Production, and Preview if needed).
- [ ] Migrations run against Neon (`prisma migrate deploy`).
- [ ] Domain added in Vercel and DNS set in GoDaddy; SSL active.
- [ ] `NEXT_PUBLIC_SITE_URL` = `https://nilekingsonline.com`.
- [ ] Twilio “From” number is correct and verified (for OTP).
- [ ] Cloudinary allowed origins include your domain if you use signed uploads from the browser.
- [ ] `.env` is in `.gitignore` and never committed.

---

## 8. Quick reference

- **Neon**: [dashboard.neon.tech](https://console.neon.tech) – connection strings, branch, region.
- **Cloudinary**: [cloudinary.com/console](https://console.cloudinary.com) – cloud name, API key/secret.
- **Twilio**: [twilio.com/console](https://console.twilio.com) – SID, token, phone numbers.
- **Upstash**: [console.upstash.com](https://console.upstash.com) – Redis REST URL and token.
- **Vercel**: [vercel.com/dashboard](https://vercel.com/dashboard) – project, env, domains, cron.

If something fails (e.g. DB, OTP, images), check Vercel **Functions** and **Logs** and confirm the corresponding env vars and external service settings.
