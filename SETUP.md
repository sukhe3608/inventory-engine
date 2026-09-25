# Free-Tier Deployment Guide

> **Quick start:** the repo already ships with `vercel.json` (frontend root = `apps/web`)
> and `render.yaml` (API blueprint). Connect GitHub → Vercel and GitHub → Render, set the
> env vars listed below, and both deploy automatically.

## Fast deploy with Vercel + Render (free)

1. Push this repo to GitHub.
2. **Vercel** (free): `vercel.com` → *Add New* → *Project* → import the repo.
   Root directory `apps/web` is auto-detected. Set the env vars from [§5](#5-deploy-frontend-vercel).
3. **Render** (free): `render.com` → *New* → *Blueprint* → pick the repo (`render.yaml`).
   The `sync: false` env vars must be added in the service settings — see [§4](#4-deploy-backend-api-render).
4. **Supabase** (free): database + auth already live; run the migrations in [§2](#2-run-migrations).
5. Open the Vercel URL and sign in with the demo account (below) or create a fresh one.

---

## Prerequisites

- [Supabase](https://supabase.com) account (free plan)
- [Render](https://render.com) account (free plan)
- [Vercel](https://vercel.com) account (free plan)
- [GitHub](https://github.com) account

---

## 1. Supabase Project

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard).
   - **Project name**: `inventory-engine` (or your choice).
   - **Database password**: Use a strong password — save it, you'll need it for direct DB access.
   - **Region**: `Mumbai (ap-south-1)` for Indian data residency.
2. Wait for the project to be ready. Copy these values from **Settings > API**:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJhbG...` (publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` (secret — never expose to browser) |
| `DATABASE_URL` | `postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres` (use **Transaction** mode pooler URL for Render) |

3. Enable extensions (Extensions > search and enable):
   - `pg_cron` — for scheduled sync.
   - `pg_net` — for HTTP calls from the database.
   - `pgcrypto` — for random hex generation (API keys).
   - `uuid-ossp` — for UUID generation.

---

## 2. Run Migrations

Open the SQL Editor in Supabase Dashboard, then run each migration **in order**:

1. Paste contents of `packages/db/migrations/0001_schema.sql` → Run.
2. Paste contents of `packages/db/migrations/0002_security.sql` → Run.
3. Paste contents of `packages/db/migrations/0003_cron.sql` → Run.

Verify the cron job exists:
```sql
SELECT * FROM cron.job WHERE jobname = 'outbox-dispatch-every-minute';
```

---

## 3. Seed Demo Data (Optional)

From your local machine, with `.env` set:

```bash
npm run seed:demo
```

This creates two demo tenants (`Acme Fashion`, `GreenLeaf Grocers`) with test users and prints API keys and widget keys.

To create the **fresh end-to-end demo tenant** (`Demo Store`) with products, stock, GST billing config,
and 5 sample orders:

```bash
node packages/db/scripts/seed-demo-fresh.mjs
```

Fresh demo credentials:

| Item | Value |
|---|---|
| Login | `demo.owner@example.in` |
| Password | `Demo@2026!Store` |
| Tenant | `Demo Store` (GSTIN `27ABCDE1234F1Z5`, UPI `demo@okhdfcbank`, 18% tax) |
| Widget key | `demo-store` |
| API key | generated at seed time (printed to console) |

To run the isolation test:
```bash
npm run test:isolation
```

---

## 4. Deploy Backend API (Render)

1. Push this repo to GitHub (public or private).
2. At [render.com](https://render.com) → **New > Web Service**.
   - **Name**: `inventory-api`
   - **Runtime**: Node
   - **Build Command**:
     ```bash
     cd apps/api && npm install && npm run build
     ```
   - **Start Command**:
     ```bash
     cd apps/api && node dist/index.js
     ```
   - **Plan**: Free

3. Set **Environment Variables** in Render:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `DATABASE_URL` | Transaction pooler URL from Supabase (step 2) |
| `SUPABASE_URL` | From step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | From step 2 |
| `SUPABASE_ANON_KEY` | From step 2 |

4. Deploy. Once live, note the service URL (e.g. `https://inventory-api.onrender.com`).

5. Test:
   ```bash
   curl https://inventory-api.onrender.com/health
   # → { "ok": true, "time": "..." }
   ```

---

## 5. Deploy Frontend (Vercel)

1. At [vercel.com](https://vercel.com) → **Add New > Project** → Import the GitHub repo.
   - **Framework**: Next.js (auto-detected).
   - **Root Directory**: `apps/web`.
   - **Build Command**: `npm run build` (default).
   - **Output**: `.next` (default).

2. Set **Environment Variables** in Vercel:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | From step 2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From step 2 |
| `SUPABASE_URL` | From step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | From step 2 |
| `DATABASE_URL` | Transaction pooler URL from step 2 |

3. Deploy. Once live, note the URL (e.g. `https://inventory-engine.vercel.app`).

4. First visit: navigate to `/signup`, create your account, then `/app/onboarding` to set up your first shop.

---

## 6. Connect API to Frontend

The frontend calls Supabase directly (auth, RLS-scoped queries). The separate Fastify API (`/v1/*`) is for **developer/POS integrations** only.

To create an API key for your tenant, go to **Settings → API Keys** in the dashboard. Use the key like:

```bash
curl -H "Authorization: Bearer inv_xxxxxxxxx" \
  https://inventory-api.onrender.com/v1/products
```

---

## 7. Embeddable Widget

Get your widget key from **Settings → Widget** in the dashboard. Use in any HTML page:

```html
<div id="inv-widget-cont"
     data-accent="#10b981"
     data-show-price="true"
     data-in-stock="In Stock"
     data-low-stock="Low Stock"
     data-out-stock="Out of Stock">
  Loading stock…
</div>
<script src="https://your-vercel-domain.com/widget-embed/YOUR_WIDGET_KEY"></script>
```

The widget polls every 30 seconds. No authentication required (public endpoint).

---

## 8. Free-Tier Limits

| Service | Free Tier | Notes |
|---|---|---|
| Supabase | 500MB DB, 1GB storage, 50k MAU | Enough for Phase 1 |
| Render | 750 hrs/month, spins down after inactivity | API cold start ~30s |
| Vercel | 100GB bandwidth, serverless functions | Frontend always warm |
| pg_cron | Included in Supabase | 1 job (outbox dispatch) |
| pg_net | Included in Supabase | HTTP calls for webhook sync |

**Known limitations**:
- Render free tier spins down after 15 min of inactivity. First request after idle takes ~30s.
- Near-real-time sync is ~30-60s (controlled by `outbox-dispatch-every-minute` cron).
- No real-time subscriptions on free tier — dashboard polls every 10s.

---

## 9. Upgrade Path (Phase 2)

When you hit 10 paying tenants:

1. **Render**: Upgrade to paid plan ($7/mo) — removes spin-down, persistent connections.
2. **Supabase**: Upgrade to Pro ($25/mo) — 8GB DB, daily backups, point-in-time recovery, no rate limits.
3. **Vercel**: Upgrade to Pro ($20/mo) if needed — or stay free if bandwidth is sufficient.
4. **Multi-region**: Add a second Supabase project in `US-East` and route tenants by region.

---

## Troubleshooting

### "Invalid API key" on frontend
Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in Vercel and match your Supabase project.

### API returns 401 on /v1/* routes
Ensure the API key starts with `inv_` and is passed as `Authorization: Bearer inv_...`. Check the key exists in the `api_keys` table.

### Widget shows "Stock unavailable"
The widget key may be invalid, or the product has no active variants. Check via:
```sql
SELECT * FROM widget_configs WHERE widget_key = 'YOUR_KEY';
SELECT * FROM products WHERE tenant_id = 'TENANT_ID' AND status = 'active';
```

### Cron job not firing
Verify pg_cron extension is enabled:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
SELECT * FROM cron.job;
```
Re-run `0003_cron.sql` if the job is missing.
