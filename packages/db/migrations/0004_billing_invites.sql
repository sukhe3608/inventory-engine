-- 0004_billing_invites.sql
-- Billing (POS): tenant billing config, order tax/discount fields, UPI payment.
-- Invites: no schema change; email delivery is handled by the API (Resend).

-- Tenant billing configuration --------------------------------
alter table public.tenants
  add column if not exists gstin text,
  add column if not exists state_code text,
  add column if not exists upi_id text,
  add column if not exists phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists tax_rate numeric(5, 2) not null default 0,
  add column if not exists enable_tax boolean not null default false,
  add column if not exists invoice_prefix text not null default 'INV';

-- Order billing fields ----------------------------------------
alter table public.orders
  add column if not exists subtotal numeric(12, 2) not null default 0,
  add column if not exists discount_amount numeric(12, 2) not null default 0,
  add column if not exists tax_amount numeric(12, 2) not null default 0,
  add column if not exists tax_rate numeric(5, 2) not null default 0,
  add column if not exists customer_gstin text,
  add column if not exists billing_meta jsonb not null default '{}'::jsonb;

-- Drop the previous signature (CREATE OR REPLACE cannot change arg count,
-- so the 11-arg create_order from 0002 would otherwise linger as an overload
-- and make PostgREST unable to pick a candidate).
drop function if exists public.create_order(jsonb, text, text, text, text, text, text, uuid, uuid, text, uuid);

-- create_order now supports tax, discount, invoice prefix and a billing snapshot ----
create or replace function public.create_order(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_email text default null,
  p_currency text default 'INR',
  p_source text default 'api',
  p_idempotency_key text default null,
  p_notes text default null,
  p_default_location_id uuid default null,
  p_actor_user_id uuid default null,
  p_actor_name text default null,
  p_tenant_id uuid default null,
  p_tax_rate numeric default null,
  p_discount numeric default null,
  p_customer_gstin text default null,
  p_billing_meta jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := p_tenant_id;
  v_actor uuid := coalesce(p_actor_user_id, auth.uid());
  v_actor_role text;
  v_order_id uuid;
  v_order_number text;
  v_seq bigint;
  v_prefix text;
  v_default_loc uuid;
  v_subtotal numeric := 0;
  it jsonb;
  v_variant uuid;
  v_qty numeric;
  v_price numeric;
  v_loc uuid;
  v_item_total numeric;
  v_existing jsonb;
  v_i integer;
  v_discount numeric := 0;
  v_taxable numeric := 0;
  v_effective_rate numeric := 0;
  v_tax numeric := 0;
  v_ten public.tenants%rowtype;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'NO_ITEMS';
  end if;

  if v_tenant is null then
    select tenant_id into v_tenant from public.variants
    where id = ((p_items -> 0) ->> 'variant_id')::uuid;
    if v_tenant is null then
      raise exception 'VARIANT_NOT_FOUND';
    end if;
  end if;

  v_actor_role := coalesce(
    (select role from public.tenant_members where tenant_id = v_tenant and user_id = v_actor),
    'api');
  if not (public.is_platform_admin() or v_actor_role in ('owner', 'manager', 'staff', 'api')) then
    raise exception 'FORBIDDEN';
  end if;

  if p_idempotency_key is not null then
    select to_jsonb(o) into v_existing from public.orders o where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return jsonb_build_object('idempotent', true, 'order',
        jsonb_build_object('order_id', v_existing ->> 'id',
          'order_number', v_existing ->> 'order_number',
          'subtotal', v_existing ->> 'subtotal',
          'discount_amount', v_existing ->> 'discount_amount',
          'tax_amount', v_existing ->> 'tax_amount',
          'tax_rate', v_existing ->> 'tax_rate',
          'total', v_existing ->> 'total',
          'status', v_existing ->> 'status',
          'billing_meta', v_existing -> 'billing_meta'));
    end if;
  end if;

  select * into v_ten from public.tenants where id = v_tenant;

  v_default_loc := v_ten.default_location_id;
  if v_default_loc is null then
    select id into v_default_loc from public.locations where tenant_id = v_tenant order by created_at limit 1;
  end if;
  if v_default_loc is null then
    raise exception 'NO_LOCATION';
  end if;
  v_default_loc := coalesce(p_default_location_id, v_default_loc);
  if not exists (select 1 from public.locations where id = v_default_loc and tenant_id = v_tenant) then
    raise exception 'LOCATION_NOT_IN_TENANT';
  end if;

  perform pg_advisory_xact_lock(hashtext('order:' || v_tenant::text)::bigint);
  select coalesce(max(substring(order_number from '[0-9]+$')::bigint), 0) + 1 into v_seq
  from public.orders where tenant_id = v_tenant;
  v_prefix := coalesce(nullif(v_ten.invoice_prefix, ''), 'INV');
  v_order_number := v_prefix || '-' || lpad(v_seq::text, 5, '0');

  insert into public.orders
    (tenant_id, order_number, customer_name, customer_email, customer_gstin, status, currency,
     total, subtotal, discount_amount, tax_amount, tax_rate, source, notes, idempotency_key, billing_meta)
  values
    (v_tenant, v_order_number, p_customer_name, p_customer_email, p_customer_gstin, 'pending',
     coalesce(nullif(p_currency, ''), 'INR'), 0, 0, 0, 0, 0, coalesce(p_source, 'api'),
     p_notes, p_idempotency_key,
     coalesce(p_billing_meta, jsonb_build_object()))
  returning id into v_order_id;

  for v_i in 0 .. jsonb_array_length(p_items) - 1 loop
    it := p_items -> v_i;
    v_variant := (it ->> 'variant_id')::uuid;
    v_qty := (it ->> 'quantity')::numeric;
    v_loc := coalesce((it ->> 'location_id')::uuid, v_default_loc);
    if v_variant is null or v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_ITEM';
    end if;
    if not exists (select 1 from public.variants where id = v_variant and tenant_id = v_tenant) then
      raise exception 'VARIANT_NOT_IN_TENANT';
    end if;
    if not exists (select 1 from public.locations where id = v_loc and tenant_id = v_tenant) then
      raise exception 'LOCATION_NOT_IN_TENANT';
    end if;
    v_price := coalesce(
      (it ->> 'unit_price')::numeric,
      (select price from public.variants where id = v_variant));
    v_item_total := round(v_qty * v_price, 2);
    v_subtotal := v_subtotal + v_item_total;

    insert into public.order_items (tenant_id, order_id, variant_id, location_id, quantity, unit_price, subtotal)
    values (v_tenant, v_order_id, v_variant, v_loc, v_qty, v_price, v_item_total);

    perform public.apply_stock_change(
      p_location_id => v_loc, p_variant_id => v_variant, p_change_qty => -v_qty,
      p_transaction_type => 'sale', p_reference_type => 'order', p_reference_id => v_order_id,
      p_notes => 'Order ' || v_order_number,
      p_idempotency_key => p_idempotency_key || ':item' || v_i::text,
      p_actor_user_id => v_actor, p_actor_name => p_actor_name, p_tenant_id => v_tenant);
  end loop;

  v_discount := greatest(coalesce(p_discount, 0), 0);
  if v_discount > v_subtotal then v_discount := v_subtotal; end if;
  v_taxable := v_subtotal - v_discount;

  if p_tax_rate is not null then
    v_effective_rate := p_tax_rate;
  elsif v_ten.enable_tax then
    v_effective_rate := coalesce(v_ten.tax_rate, 0);
  else
    v_effective_rate := 0;
  end if;
  v_tax := round(v_taxable * v_effective_rate / 100, 2);

  update public.orders
    set subtotal = v_subtotal,
        discount_amount = v_discount,
        tax_amount = v_tax,
        tax_rate = v_effective_rate,
        total = v_taxable + v_tax,
        updated_at = now()
    where id = v_order_id;

  insert into public.audit_logs (tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, meta)
  values (v_tenant, v_actor, v_actor_role, 'order.create', 'order', v_order_id,
    jsonb_build_object('order_number', v_order_number, 'total', v_taxable + v_tax,
      'items', jsonb_array_length(p_items)));

  insert into public.outbox_events (tenant_id, event_type, payload, idempotency_key)
  values (v_tenant, 'order.created',
    jsonb_build_object('event_id', gen_random_uuid(), 'tenant_id', v_tenant, 'type', 'order.created',
      'order_id', v_order_id, 'order_number', v_order_number, 'total', v_taxable + v_tax,
      'status', 'pending', 'timestamp', now()),
    coalesce(p_idempotency_key, gen_random_uuid()::text) || ':order:created');

  return jsonb_build_object('idempotent', false, 'order_id', v_order_id,
    'order_number', v_order_number, 'subtotal', v_subtotal,
    'discount_amount', v_discount, 'tax_amount', v_tax, 'tax_rate', v_effective_rate,
    'total', v_taxable + v_tax, 'status', 'pending',
    'billing_meta', coalesce(p_billing_meta, jsonb_build_object()));
end;
$$;

grant execute on function public.create_order(
  jsonb, text, text, text, text, text, text, uuid, uuid, text, uuid, numeric, numeric, text, jsonb
) to authenticated, service_role;