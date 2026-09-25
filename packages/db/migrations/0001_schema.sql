create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  language text not null default 'en',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  default_language text not null default 'en',
  allow_negative_stock boolean not null default false,
  default_location_id uuid,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff', 'read_only')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager', 'staff', 'read_only')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  parent_id uuid references public.categories (id) on delete set null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null,
  name text,
  barcode text,
  price numeric(12, 2) not null default 0,
  cost numeric(12, 2),
  attributes jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  location_type text not null default 'store' check (location_type in ('store', 'warehouse', 'other')),
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text not null default 'IN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  quantity_on_hand numeric(12, 3) not null default 0,
  quantity_reserved numeric(12, 3) not null default 0,
  quantity_available numeric(12, 3) generated always as (quantity_on_hand - quantity_reserved) stored,
  low_stock_threshold numeric(12, 3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (variant_id, location_id)
);

create table public.stock_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  change_qty numeric(12, 3) not null,
  qty_after numeric(12, 3) not null,
  transaction_type text not null,
  reference_type text,
  reference_id uuid,
  actor_user_id uuid,
  actor_name text,
  notes text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create index stock_transactions_tenant_created_idx on public.stock_transactions (tenant_id, created_at desc);
create index stock_transactions_variant_idx on public.stock_transactions (variant_id, location_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_number text not null,
  customer_name text,
  customer_email text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'fulfilled', 'cancelled')),
  currency text not null default 'INR',
  total numeric(12, 2) not null default 0,
  source text not null default 'api',
  notes text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_number)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0
);
create index order_items_order_idx on public.order_items (order_id);

create table public.low_stock_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  threshold numeric(12, 3) not null,
  quantity numeric(12, 3) not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index low_stock_alerts_tenant_status_idx on public.low_stock_alerts (tenant_id, status);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  actor_user_id uuid,
  actor_role text,
  action text not null,
  entity_type text,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['stock:read']::text[],
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_tenant_idx on public.api_keys (tenant_id);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  url text not null,
  secret text not null,
  events text[] not null default array['stock.updated']::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.widget_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  widget_key text not null unique,
  title text not null default 'Live Stock',
  show_price boolean not null default true,
  in_stock_label text not null default 'In stock',
  low_stock_label text not null default 'Low stock',
  out_of_stock_label text not null default 'Out of stock',
  accent_color text not null default '#16a34a',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dead')),
  attempts integer not null default 0,
  next_retry_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbox_events_pending_idx on public.outbox_events (status, next_retry_at);

alter table public.tenants
  add constraint tenants_default_location_fk foreign key (default_location_id) references public.locations (id) on delete set null;

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.invitations enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.locations enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_transactions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.low_stock_alerts enable row level security;
alter table public.audit_logs enable row level security;
alter table public.api_keys enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.widget_configs enable row level security;
alter table public.outbox_events enable row level security;