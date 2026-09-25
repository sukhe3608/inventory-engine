# Inventory Engine

Multi-tenant inventory management, billing (POS), and order SaaS built for Indian retail. Each tenant (shop) has isolated data, role-based access, and their own UPI payment flow. A platform admin console provides cross-tenant visibility and support tooling.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS v4, TypeScript |
| Backend API | Fastify 5, Node.js, Zod validation, pg (node-postgres) |
| Database | Supabase-hosted PostgreSQL, Row Level Security, pg_cron, pg_net, pgcrypto |
| Auth | Supabase Auth (email/password), cookie-based SSR sessions |
| Email | Resend (optional — invite delivery) |
| Deployment | Vercel (frontend), Render (API), Supabase (database) |
| Monorepo | npm workspaces |

---

## Features

### Tenant Features
- **Products & Variants** — SKUs, categories, prices, barcodes, attributes (size/color)
- **Inventory** — stock levels per variant×location, low-stock alerts, threshold config, opening balances, adjustment history with actor audit trail
- **Orders (Billing/POS)** — create orders with line items, per-order discount (% or flat), GST/tax (CGST+SGST split), customer GSTIN, configurable invoice prefix, UPI payment QR code, amount-in-words
- **Alerts** — open/resolve low-stock alerts
- **Reports** — order CSV export, stock valuation, audit log
- **Settings** — shop profile (GSTIN, state code, UPI ID, phone, address, tax rate), team management (invite/revoke/change role), API keys, widget config, webhooks
- **Embeddable Widget** — public-facing, auto-polling stock status for any website (no auth required)
- **i18n** — English and Hindi

### Platform Admin (`is_platform_admin = true`)
- **Admin Dashboard** (`/admin/dashboard`) — KPIs (active tenants, revenue, pending orders, low-stock items), 14-day revenue bar chart, orders-by-status donut, top tenants by revenue, tenant health table
- **Support Console** (`/admin/support`) — full tenant search, drill-down tabs (overview, members, data fixes, shop settings, audit/outbox), server-based password resets, stock adjustments, order status fixes, tenant suspend/activate
- Platform admins see only Alerts/Reports/Settings/Admin Dashboard/Admin Support in the tenant sidebar — tenant pages (Dashboard, Inventory, Products, Orders, Billing) are hidden

### Security
- **Row Level Security (RLS)** on every table — queries scoped to the user's tenant
- **RBAC** — `owner` > `manager` > `staff` > `read_only`, enforced at both RLS policy and PL/pgSQL trigger level
- **Platform admin** — superuser flag in `profiles`, bypasses all tenant RLS; used for cross-tenant admin console and support operations
- **API keys** — hashed (SHA-256), scope-restricted, per-tenant, used for the Fastify REST API
- **Admin escalation guard** — trigger prevents a non-admin from setting `is_platform_admin = true` on their own profile
- **Owner role guard** — trigger prevents non-owners from demoting/removing an owner
- **Tenant status guard** — only platform admins or the owner can suspend/activate a tenant
- **Idempotency** — `create_order` and `apply_stock_change` support idempotency keys (advisory lock + unique constraint)
- **Webhook signatures** — HMAC-SHA256 signed payloads dispatched from an outbox via pg_cron + pg_net

---

## Project Structure

```
inventory-engine/
├── apps/
│   ├── web/                  # Next.js 15 frontend (App Router)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (app)/         # Tenant pages (auth + tenant context)
│   │       │   │   ├── dashboard/
│   │       │   │   ├── inventory/
│   │       │   │   ├── products/
│   │       │   │   ├── orders/
│   │       │   │   ├── billing/
│   │       │   │   ├── alerts/
│   │       │   │   ├── reports/
│   │       │   │   ├── settings/
│   │       │   │   └── onboarding/
│   │       │   ├── admin/         # Platform admin (separate layout, no tenant context)
│   │       │   │   ├── dashboard/   # KPI dashboard with charts
│   │       │   │   ├── support/     # Tenant support console
│   │       │   │   ├── admin-shell.tsx
│   │       │   │   └── layout.tsx   # Server guard (platform admin only)
│   │       │   ├── login/
│   │       │   ├── signup/
│   │       │   └── api/
│   │       │       └── widget/[key]/  # Public widget JSON endpoint
│   │       ├── components/
│   │       │   ├── app/
│   │       │   │   ├── shell.tsx     # Tenant sidebar shell
│   │       │   │   └── provider.tsx  # React context (user, tenant, role, supabase)
│   │       │   ├── billing/
│   │       │   │   ├── UpiQr.tsx
│   │       │   │   └── BillDocument.tsx
│   │       │   └── ui.tsx
│   │       └── lib/
│   │           ├── supabase/
│   │           │   ├── server.ts       # SSR client (cookie session)
│   │           │   ├── client.ts       # Browser client
│   │           │   ├── admin.ts        # Service-role client (server-only)
│   │           │   ├── admin-session.ts # Platform admin verification
│   │           │   └── middleware.ts    # Session refresh middleware
│   │           ├── types.ts          # All TypeScript interfaces
│   │           ├── i18n.ts           # en/hi dictionary
│   │           ├── format.ts         # INR formatting, amount-in-words
│   │           ├── billing.ts        # Cart/tax/discount computation, UPI URL
│   │           └── invites.ts        # Send invite via API
│   │
│   └── api/                  # Fastify REST API (developer/POS integrations)
│       └── src/
│           ├── index.ts         # Fastify bootstrap, CORS/helmet/rate-limit
│           ├── config.ts        # Env config loader
│           ├── db.ts            # pg Pool
│           ├── auth.ts          # API key validation (SHA-256 hash lookup)
│           └── routes/
│               ├── health.ts
│               ├── products.ts   # GET /v1/products, GET /v1/products/:id
│               ├── stock.ts      # GET /v1/stock, GET /v1/stock/history, POST /v1/stock/adjustments, POST /v1/stock/opening-balances
│               ├── orders.ts     # GET /v1/orders, POST /v1/orders, POST /v1/orders/:id/cancel
│               └── invitations.ts # POST /v1/invitations/:id/send-email
│
└── packages/
    └── db/                   # Database migrations, seed, isolation test
        ├── migrations/
        │   ├── 0001_schema.sql        # All tables, RLS enable
        │   ├── 0002_security.sql      # RPCs (apply_stock_change, create_order, etc.), RLS policies, triggers, GRANTs
        │   ├── 0003_cron.sql          # pg_cron outbox dispatch job
        │   └── 0004_billing_invites.sql # Billing columns on tenants/orders, updated create_order with tax/discount
        └── scripts/
            ├── seed-demo.mjs          # Creates two demo tenants with users, products, stock
            └── isolation-test.mjs     # Verifies cross-tenant isolation
```

---

## Database Schema

All tables live in the `public` schema. Every table has `tenant_id` (except `profiles`) and is protected by RLS.

| Table | Purpose |
|---|---|
| `profiles` | User profile, linked to `auth.users`, `is_platform_admin` flag |
| `tenants` | Shops (name, slug, currency, timezone, GSTIN, UPI, tax config, invoice prefix) |
| `tenant_members` | User↔Tenant membership with RBAC role |
| `invitations` | Pending team invites with token |
| `categories` | Hierarchical product categories (parent_id self-ref) |
| `products` | Products linked to tenant and optional category |
| `variants` | SKUs under a product (price, cost, barcode, attributes JSONB) |
| `locations` | Stores/warehouses |
| `stock_levels` | On-hand/reserved/available quantity per variant×location, low-stock threshold |
| `stock_transactions` | Full audit trail of every stock change (adjustment, sale, reversal) |
| `orders` | Orders with subtotal, discount, tax, total, billing_meta snapshot |
| `order_items` | Line items (variant, qty, unit price, subtotal) |
| `low_stock_alerts` | Open/resolved alerts when quantity ≤ threshold |
| `audit_logs` | Every mutation logged with actor, role, action, entity, metadata |
| `api_keys` | Hashed API keys with scopes (stock:read, stock:write, orders:write, products:read) |
| `webhook_endpoints` | Outbound webhook URLs with event filters and HMAC secrets |
| `widget_configs` | Embeddable widget configuration per tenant (widget_key, labels, accent color) |
| `outbox_events` | Reliable outbox pattern for webhook dispatch (pending→sent→dead, pg_cron) |

### Key PL/pgSQL RPCs

| Function | Purpose |
|---|---|
| `create_tenant(name, slug, ...)` | Creates tenant + owner membership + widget config |
| `accept_invitation()` | Auto-accept pending invite for the current user's email |
| `apply_stock_change(...)` | Atomic stock mutation with advisory lock, audit, outbox event, auto low-stock alert |
| `create_order(items, ...)` | Atomic order creation with stock deduction, tax/discount, billing snapshot |
| `update_order_status(...)` | Status change with stock reversal on cancel |
| `set_stock_threshold(...)` | Update low-stock threshold for a variant×location |
| `widget_stock(widget_key)` | Public — returns stock summary for the embeddable widget |
| `dispatch_outbox(limit)` | Picks pending events, dispatches via pg_net, marks sent/dead |

---

## Local Development

### Prerequisites
- Node.js 20+
- A Supabase project (free tier) — [supabase.com](https://supabase.com)
- PostgreSQL 18+ (for running `psql` migrations directly, optional — can use SQL Editor)

### 1. Clone and install

```bash
git clone <repo-url>
cd inventory-engine
npm install
```

### 2. Database setup

In the Supabase SQL Editor, run each migration in order:
1. `packages/db/migrations/0001_schema.sql`
2. `packages/db/migrations/0002_security.sql`
3. `packages/db/migrations/0003_cron.sql`
4. `packages/db/migrations/0004_billing_invites.sql`

### 3. Seed demo data (optional)

Create a root `.env`:
```env
SUPABASE_URL=https://YOURPROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

```bash
npm run seed:demo
```

This creates two tenants (`Acme Fashion`, `GreenLeaf Grocers`) with owners, products, stock, and an API key per tenant.

### 4. Configure apps

**apps/web/.env** (required):
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOURPROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXT_PUBLIC_API_URL=http://localhost:8080
```

**apps/api/.env** (required for API):
```env
DATABASE_URL=postgresql://postgres:PASSWORD@db.YOURPROJECT.supabase.co:5432/postgres?pgbouncer=true
SUPABASE_URL=https://YOURPROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
PORT=8080
RESEND_API_KEY=re_YOUR_KEY          # optional — for invite emails
WEB_URL=http://localhost:3000
```

### 5. Run

```bash
# Frontend (port 3000)
npm run dev:web

# API (port 8080) — in a separate terminal
npm run dev:api
```

Open [http://localhost:3000](http://localhost:3000). Sign up, create a shop via onboarding, then start managing inventory.

### Useful commands

```bash
npm run typecheck   # Type-check all packages
npm run lint        # Lint all packages
npm run build       # Production build all packages
npm run seed:demo   # Seed demo tenants
npm run test:isolation  # Verify cross-tenant data isolation
```

---

## Deployment

See [SETUP.md](./SETUP.md) for a step-by-step free-tier deployment guide covering:
- Supabase project setup (extensions, connection strings)
- Render (Fastify API)
- Vercel (Next.js frontend)
- Environment variable reference
- Upgrade path

---

## REST API (Fastify)

The separate Fastify API at `/v1/*` is for **external integrations** (POS systems, partner apps). It authenticates via API keys (not Supabase sessions).

### Authentication

```
Authorization: Bearer inv_xxxxxxxxxxxxxxxx
```

API keys are created in the web dashboard under **Settings → API Keys**. Keys are SHA-256 hashed before storage; the raw key is shown only once.

### Scopes

| Scope | Grants |
|---|---|
| `stock:read` | Read stock levels and history |
| `stock:write` | Adjust stock, set opening balances |
| `products:read` | List and read products |
| `orders:read` | List orders |
| `orders:write` | Create orders, cancel orders |

### Endpoints

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/health` | none | DB health check |
| GET | `/v1/products` | `products:read` | List all products with variants and total stock |
| GET | `/v1/products/:id` | `products:read` | Get a single product |
| GET | `/v1/stock` | `stock:read` | List stock levels (filters: variant_id, location_id, since) |
| GET | `/v1/stock/history` | `stock:read` | Stock transaction history (filters: variant_id, location_id, since, limit) |
| POST | `/v1/stock/adjustments` | `stock:write` | Create a stock adjustment |
| POST | `/v1/stock/opening-balances` | `stock:write` | Set an opening balance |
| GET | `/v1/orders` | `orders:read` | List recent orders with line items |
| POST | `/v1/orders` | `orders:write` | Create an order (requires `Idempotency-Key` header, ≥8 chars) |
| POST | `/v1/orders/:id/cancel` | `orders:write` | Cancel an order (reverses stock) |
| POST | `/v1/invitations/:id/send-email` | none | Send invite email via Resend |

---

## Embeddable Widget

Any public webpage can display live stock status without authentication.

**Dashboard → Settings → Widget** to get your widget key. Then:

```html
<div id="inv-widget-cont"
     data-accent="#10b981"
     data-show-price="true"
     data-in-stock="In Stock"
     data-low-stock="Low Stock"
     data-out-stock="Out of Stock">
  Loading stock…
</div>
<script src="https://YOUR_DOMAIN/widget-embed/YOUR_WIDGET_KEY"></script>
```

The widget fetches `/api/widget/<key>` every 30 seconds and renders stock status with prices. The API endpoint is cached for 30s via `Cache-Control` headers.

---

## Billing / POS

The Orders page functions as a POS terminal:
- Pick items from the variant list → enter quantity → see live line totals
- Apply a discount (flat amount or percentage toggle)
- Tax auto-calculated from tenant config (GSTIN, tax rate, CGST+SGST split) or overridden per order
- Customer name, email, GSTIN fields
- On save, an order is created atomically (via `create_order` RPC) with full `billing_meta` snapshot (shop name, UPI ID, address, prefix — frozen at time of bill)
- Print-optimized bill layout (A4, amount in words, CGST/SGST split)
- UPI payment QR code rendered live when a `UPI ID` is configured in tenant settings

---

## Platform Admin

A user with `is_platform_admin = true` in the `profiles` table has access to:

| Route | Purpose |
|---|---|
| `/admin` | Redirects to `/admin/dashboard` |
| `/admin/dashboard` | Cross-tenant KPI dashboard (14-day revenue chart, status donut, top tenants, tenant health table) |
| `/admin/support` | Full tenant support console (search, member management, stock fixes, order status fixes, tenant suspend/activate, audit log, outbox view) |

### Setting a platform admin

```sql
UPDATE public.profiles
SET is_platform_admin = true
WHERE user_id = 'USER_UUID_HERE';
```

### Tenant sidebar for platform admins

Platform admins see: Alerts, Reports, Settings, Admin Dashboard, Admin Support. The five tenant pages (Dashboard, Inventory, Products, Orders, Billing) are hidden to keep the admin context clean.

---

## Migration Notes

| Migration | What it does |
|---|---|
| 0001 | Creates all tables, enables RLS |
| 0002 | Security functions (`can()`, `is_platform_admin()`, `member_role()`), triggers (owner/admin guards), RPCs (`create_tenant`, `apply_stock_change`, `create_order`, `update_order_status`, `widget_stock`, `dispatch_outbox`), all RLS policies, GRANT/REVOKE |
| 0003 | Schedules `outbox-dispatch-every-minute` via pg_cron |
| 0004 | Adds billing columns to `tenants` and `orders`; drops the 11-arg `create_order` overload; re-creates a 15-arg version with tax/discount/billing_meta support |

---

## Testing

```bash
npm run test:isolation    # Verifies cross-tenant data isolation
```

Manual verification checklist:
- Sign in as a non-admin user → confirm only your tenant's data is visible
- Sign in as `is_platform_admin` → confirm admin dashboard loads, support console works, tenant sidebar shows only Alerts/Reports/Settings/Admin
- Run `npm run typecheck && npm run lint` from root — all packages should pass

---

## Environment Variables

### Frontend (`apps/web`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service-role key (server-only, never exposed to browser) |
| `NEXT_PUBLIC_API_URL` | No | Fastify API URL (default: `http://localhost:8080`) |

### API (`apps/api`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (transaction pooler) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service-role key |
| `PORT` | No | Listen port (default: 8080) |
| `RATE_LIMIT_MAX` | No | Requests per minute per IP (default: 300) |
| `TRUST_PROXY` | No | Set `true` behind a reverse proxy |
| `CORS_ORIGIN` | No | Allowed origin (default: `http://localhost:3000`) |
| `RESEND_API_KEY` | No | Enables invite email delivery |
| `EMAIL_FROM` | No | Sender address (default: `Inventory Engine <onboarding@resend.dev>`) |
| `WEB_URL` | No | Frontend URL for invite links (default: `http://localhost:3000`) |

### Root (seed scripts)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | For seed | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For seed | Service-role key |
