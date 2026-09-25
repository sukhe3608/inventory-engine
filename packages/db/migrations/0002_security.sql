create or replace function public.member_role(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.tenant_members where tenant_id = p_tenant_id and user_id = auth.uid() limit 1;
$$;

create or replace function public.role_weight(p_role text)
returns integer
language sql
immutable
as $$
  select case p_role
    when 'owner' then 5
    when 'manager' then 4
    when 'staff' then 3
    when 'read_only' then 2
    else 0
  end;
$$;

create or replace function public.can(p_tenant_id uuid, p_min_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.role_weight(public.member_role(p_tenant_id)) >= public.role_weight(p_min_role);
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where user_id = auth.uid() and is_platform_admin
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.guard_tenant_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    and not (public.is_platform_admin() or public.member_role(old.id) = 'owner') then
    raise exception 'TENANT_STATUS_FORBIDDEN';
  end if;
  return new;
end;
$$;

create trigger tenant_status_guard
  before update on public.tenants
  for each row execute function public.guard_tenant_status();

create or replace function public.guard_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      v_actor_role := public.member_role(old.tenant_id);
      if not (public.is_platform_admin() or v_actor_role = 'owner') then
        raise exception 'OWNER_ROLE_FORBIDDEN';
      end if;
    end if;
  else
    if old.role = 'owner' and new.role is distinct from old.role then
      v_actor_role := public.member_role(old.tenant_id);
      if not (public.is_platform_admin() or v_actor_role = 'owner') then
        raise exception 'OWNER_ROLE_FORBIDDEN';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger member_change_guard
  before update or delete on public.tenant_members
  for each row execute function public.guard_member_change();

create or replace function public.guard_profile_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_platform_admin and new.user_id = auth.uid() and not public.is_platform_admin() then
    raise exception 'ADMIN_ESCALATION_FORBIDDEN';
  end if;
  return new;
end;
$$;

create trigger profile_admin_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_admin();

create or replace function public.create_tenant(
  p_name text,
  p_slug text,
  p_currency text default 'INR',
  p_timezone text default 'Asia/Kolkata',
  p_default_language text default 'en'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_slug text := coalesce(nullif(lower(regexp_replace(p_slug, '[^a-z0-9-]', '', 'g')), ''),
                          't-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  insert into public.tenants (name, slug, currency, timezone, default_language)
  values (p_name, v_slug, coalesce(p_currency, 'INR'), coalesce(p_timezone, 'Asia/Kolkata'),
          coalesce(p_default_language, 'en'))
  returning id into v_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant_id, auth.uid(), 'owner');

  insert into public.widget_configs (tenant_id, widget_key)
  values (v_tenant_id, gen_random_uuid()::text);

  insert into public.audit_logs (tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, meta)
  values (v_tenant_id, auth.uid(), 'owner', 'tenant.create', 'tenant', v_tenant_id,
          jsonb_build_object('name', p_name));

  return jsonb_build_object('tenant_id', v_tenant_id, 'slug', v_slug);
end;
$$;

create or replace function public.accept_invitation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_inv public.invitations%rowtype;
  v_dup integer;
begin
  select email into v_email from public.profiles where user_id = auth.uid();
  if v_email is null then
    raise exception 'NO_PROFILE';
  end if;
  select * into v_inv
  from public.invitations
  where email = v_email and status = 'pending'
  order by created_at
  limit 1;
  if v_inv.id is null then
    return jsonb_build_object('accepted', false);
  end if;
  select count(*) into v_dup
  from public.tenant_members
  where tenant_id = v_inv.tenant_id and user_id = auth.uid();
  if v_dup = 0 then
    insert into public.tenant_members (tenant_id, user_id, role)
    values (v_inv.tenant_id, auth.uid(), v_inv.role);
  end if;
  update public.invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
  return jsonb_build_object('accepted', true, 'tenant_id', v_inv.tenant_id, 'role', v_inv.role);
end;
$$;

create or replace function public.apply_stock_change(
  p_location_id uuid,
  p_variant_id uuid,
  p_change_qty numeric,
  p_transaction_type text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null,
  p_actor_user_id uuid default null,
  p_actor_name text default null,
  p_tenant_id uuid default null
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
  v_allow_negative boolean := false;
  v_current numeric := 0;
  v_threshold numeric := 0;
  v_after numeric;
  v_tx_id uuid;
  v_event_id uuid;
  v_existing jsonb;
begin
  if v_tenant is null then
    select l.tenant_id into v_tenant from public.locations l where l.id = p_location_id;
    if v_tenant is null then
      raise exception 'INVALID_OR_UNSCOPED_LOCATION';
    end if;
  end if;

  if not exists (select 1 from public.locations where id = p_location_id and tenant_id = v_tenant) then
    raise exception 'LOCATION_NOT_IN_TENANT';
  end if;
  if not exists (select 1 from public.variants where id = p_variant_id and tenant_id = v_tenant) then
    raise exception 'VARIANT_NOT_IN_TENANT';
  end if;

  v_actor_role := coalesce(
    (select role from public.tenant_members where tenant_id = v_tenant and user_id = v_actor),
    'api');
  if not (public.is_platform_admin() or v_actor_role in ('owner', 'manager', 'staff', 'api')) then
    raise exception 'FORBIDDEN';
  end if;

  if p_idempotency_key is not null then
    select to_jsonb(t) into v_existing from public.stock_transactions t where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return jsonb_build_object('idempotent', true, 'transaction', v_existing);
    end if;
  end if;

  select allow_negative_stock into v_allow_negative from public.tenants where id = v_tenant;

  perform pg_advisory_xact_lock(hashtext('stock:' || p_variant_id::text || ':' || p_location_id::text)::bigint);

  select coalesce(quantity_on_hand, 0), coalesce(low_stock_threshold, 0)
    into v_current, v_threshold
  from public.stock_levels
  where variant_id = p_variant_id and location_id = p_location_id;

  v_current := coalesce(v_current, 0);
  v_threshold := coalesce(v_threshold, 0);

  if p_change_qty < 0 and (v_current + p_change_qty) < 0 and not v_allow_negative then
    raise exception 'NEGATIVE_STOCK_NOT_ALLOWED';
  end if;
  v_after := v_current + p_change_qty;

  insert into public.stock_levels (tenant_id, variant_id, location_id, quantity_on_hand, low_stock_threshold)
  values (v_tenant, p_variant_id, p_location_id, v_after, coalesce(v_threshold, 0))
  on conflict (variant_id, location_id) do update
    set quantity_on_hand = public.stock_levels.quantity_on_hand + (v_after - v_current),
        updated_at = now();

  insert into public.stock_transactions
    (tenant_id, location_id, variant_id, change_qty, qty_after, transaction_type,
     reference_type, reference_id, actor_user_id, actor_name, notes, idempotency_key)
  values
    (v_tenant, p_location_id, p_variant_id, p_change_qty, v_after, p_transaction_type,
     p_reference_type, p_reference_id, v_actor,
     coalesce(p_actor_name, (select display_name from public.profiles where user_id = v_actor)),
     p_notes, p_idempotency_key)
  returning id into v_tx_id;

  if v_threshold > 0 and v_after <= v_threshold then
    if not exists (
      select 1 from public.low_stock_alerts
      where tenant_id = v_tenant and variant_id = p_variant_id
        and location_id = p_location_id and status = 'open'
    ) then
      insert into public.low_stock_alerts (tenant_id, variant_id, location_id, threshold, quantity, status)
      values (v_tenant, p_variant_id, p_location_id, v_threshold, v_after, 'open');
    end if;
  end if;

  insert into public.audit_logs
    (tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, meta)
  values
    (v_tenant, v_actor, v_actor_role, 'stock.change', 'variant', p_variant_id,
     jsonb_build_object('location_id', p_location_id, 'change', p_change_qty, 'after', v_after,
       'type', p_transaction_type, 'reference_type', p_reference_type, 'reference_id', p_reference_id));

  insert into public.outbox_events (tenant_id, event_type, payload, idempotency_key)
  values (v_tenant, 'stock.updated',
    jsonb_build_object('event_id', gen_random_uuid(), 'tenant_id', v_tenant, 'type', 'stock.updated',
      'variant_id', p_variant_id, 'location_id', p_location_id, 'quantity_on_hand', v_after,
      'change', p_change_qty, 'transaction_type', p_transaction_type, 'timestamp', now()),
    coalesce(p_idempotency_key, gen_random_uuid()::text) || ':evt')
  returning id into v_event_id;

  return jsonb_build_object('idempotent', false, 'transaction_id', v_tx_id, 'event_id', v_event_id,
    'variant_id', p_variant_id, 'location_id', p_location_id, 'change', p_change_qty, 'after', v_after);
end;
$$;

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
  p_tenant_id uuid default null
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
  v_default_loc uuid;
  v_total numeric := 0;
  it jsonb;
  v_variant uuid;
  v_qty numeric;
  v_price numeric;
  v_loc uuid;
  v_item_total numeric;
  v_existing jsonb;
  v_i integer;
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
      return jsonb_build_object('idempotent', true, 'order', v_existing);
    end if;
  end if;

  select default_location_id into v_default_loc from public.tenants where id = v_tenant;
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
  v_order_number := 'INV-' || lpad(v_seq::text, 5, '0');

  insert into public.orders
    (tenant_id, order_number, customer_name, customer_email, status, currency, total, source, notes, idempotency_key)
  values
    (v_tenant, v_order_number, p_customer_name, p_customer_email, 'pending',
     coalesce(nullif(p_currency, ''), 'INR'), 0, coalesce(p_source, 'api'), p_notes, p_idempotency_key)
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
    v_total := v_total + v_item_total;

    insert into public.order_items (tenant_id, order_id, variant_id, location_id, quantity, unit_price, subtotal)
    values (v_tenant, v_order_id, v_variant, v_loc, v_qty, v_price, v_item_total);

    perform public.apply_stock_change(
      p_location_id => v_loc, p_variant_id => v_variant, p_change_qty => -v_qty,
      p_transaction_type => 'sale', p_reference_type => 'order', p_reference_id => v_order_id,
      p_notes => 'Order ' || v_order_number,
      p_idempotency_key => p_idempotency_key || ':item' || v_i::text,
      p_actor_user_id => v_actor, p_actor_name => p_actor_name, p_tenant_id => v_tenant);
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  insert into public.audit_logs (tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, meta)
  values (v_tenant, v_actor, v_actor_role, 'order.create', 'order', v_order_id,
    jsonb_build_object('order_number', v_order_number, 'total', v_total,
      'items', jsonb_array_length(p_items)));

  insert into public.outbox_events (tenant_id, event_type, payload, idempotency_key)
  values (v_tenant, 'order.created',
    jsonb_build_object('event_id', gen_random_uuid(), 'tenant_id', v_tenant, 'type', 'order.created',
      'order_id', v_order_id, 'order_number', v_order_number, 'total', v_total, 'status', 'pending',
      'timestamp', now()),
    coalesce(p_idempotency_key, gen_random_uuid()::text) || ':order:created');

  return jsonb_build_object('idempotent', false, 'order_id', v_order_id,
    'order_number', v_order_number, 'total', v_total, 'status', 'pending');
end;
$$;

create or replace function public.update_order_status(
  p_order_id uuid,
  p_status text,
  p_actor_user_id uuid default null,
  p_actor_name text default null,
  p_tenant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_tenant uuid := p_tenant_id;
  v_actor uuid := coalesce(p_actor_user_id, auth.uid());
  v_actor_role text;
  it record;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_tenant is null then
    v_tenant := v_order.tenant_id;
  end if;
  if v_order.tenant_id <> v_tenant then
    raise exception 'ORDER_NOT_IN_TENANT';
  end if;
  if p_status not in ('pending', 'paid', 'fulfilled', 'cancelled') then
    raise exception 'INVALID_STATUS';
  end if;

  v_actor_role := coalesce(
    (select role from public.tenant_members where tenant_id = v_tenant and user_id = v_actor),
    'api');
  if not (public.is_platform_admin() or v_actor_role in ('owner', 'manager', 'staff', 'api')) then
    raise exception 'FORBIDDEN';
  end if;

  if p_status = v_order.status then
    return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
      'status', v_order.status, 'changed', false);
  end if;

  if p_status = 'cancelled' then
    for it in select * from public.order_items where order_id = v_order.id loop
      perform public.apply_stock_change(
        p_location_id => it.location_id, p_variant_id => it.variant_id, p_change_qty => it.quantity,
        p_transaction_type => 'sale_reversal', p_reference_type => 'order', p_reference_id => v_order.id,
        p_notes => 'Cancel ' || v_order.order_number,
        p_idempotency_key => 'cancel:' || v_order.id::text || ':' || it.id::text,
        p_actor_user_id => v_actor, p_actor_name => p_actor_name, p_tenant_id => v_tenant);
    end loop;
  end if;

  update public.orders set status = p_status, updated_at = now() where id = v_order.id;

  insert into public.audit_logs (tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, meta)
  values (v_tenant, v_actor, v_actor_role, 'order.status', 'order', v_order.id,
    jsonb_build_object('order_number', v_order.order_number, 'from', v_order.status, 'to', p_status));

  insert into public.outbox_events (tenant_id, event_type, payload, idempotency_key)
  values (v_tenant, 'order.updated',
    jsonb_build_object('event_id', gen_random_uuid(), 'tenant_id', v_tenant, 'type', 'order.updated',
      'order_id', v_order.id, 'order_number', v_order.order_number, 'status', p_status,
      'timestamp', now()),
    'status:' || v_order.id::text || ':' || p_status);

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
    'status', p_status, 'changed', true);
end;
$$;

create or replace function public.set_stock_threshold(
  p_variant_id uuid,
  p_location_id uuid,
  p_threshold numeric,
  p_tenant_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := p_tenant_id;
  v_actor uuid := auth.uid();
  v_actor_role text;
begin
  if v_tenant is null then
    select tenant_id into v_tenant from public.variants where id = p_variant_id;
  end if;
  if v_tenant is null then
    raise exception 'VARIANT_NOT_FOUND';
  end if;
  if not exists (select 1 from public.variants where id = p_variant_id and tenant_id = v_tenant) then
    raise exception 'VARIANT_NOT_IN_TENANT';
  end if;
  if not exists (select 1 from public.locations where id = p_location_id and tenant_id = v_tenant) then
    raise exception 'LOCATION_NOT_IN_TENANT';
  end if;

  v_actor_role := (select role from public.tenant_members where tenant_id = v_tenant and user_id = v_actor);
  if v_actor_role is null then
    v_actor_role := 'api';
  end if;
  if not (public.is_platform_admin() or v_actor_role in ('owner', 'manager')) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.stock_levels (tenant_id, variant_id, location_id, quantity_on_hand, low_stock_threshold)
  values (v_tenant, p_variant_id, p_location_id, 0, coalesce(p_threshold, 0))
  on conflict (variant_id, location_id) do update
    set low_stock_threshold = excluded.low_stock_threshold,
        updated_at = now();
end;
$$;

create or replace function public.widget_stock(p_widget_key text)
returns table (
  sku text,
  name text,
  quantity numeric,
  available numeric,
  in_stock boolean,
  low_stock boolean,
  price numeric,
  currency text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.sku,
    coalesce(nullif(v.name, ''), pr.name) as name,
    sum(sl.quantity_on_hand) :: numeric as quantity,
    sum(sl.quantity_available) :: numeric as available,
    sum(sl.quantity_available) > 0 as in_stock,
    bool_or(sl.low_stock_threshold > 0 and sl.quantity_available <= sl.low_stock_threshold) as low_stock,
    v.price :: numeric as price,
    t.currency :: text as currency
  from public.widget_configs wc
  join public.tenants t on t.id = wc.tenant_id
  join public.products pr on pr.tenant_id = wc.tenant_id and pr.active
  join public.variants v on v.product_id = pr.id and v.tenant_id = wc.tenant_id and v.active
  join public.stock_levels sl on sl.variant_id = v.id
  where wc.widget_key = p_widget_key
  group by v.sku, v.name, pr.name, v.price, t.currency
  order by v.sku;
$$;

create or replace function public.dispatch_outbox(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev record;
  v_ep record;
  v_sig text;
  v_headers jsonb;
  v_sent integer := 0;
  v_after integer;
begin
  for v_ev in
    select * from public.outbox_events
    where status = 'pending' and next_retry_at <= now()
    order by created_at
    limit p_limit
    for update skip locked
  loop
    v_sent := 0;
    for v_ep in
      select * from public.webhook_endpoints
      where tenant_id = v_ev.tenant_id and active
        and v_ev.event_type = any (events)
    loop
      v_sig := 'sha256=' || encode(hmac(v_ev.payload::text, v_ep.secret, 'sha256'), 'hex');
      v_headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-event-id', v_ev.id::text,
        'x-tenant-id', v_ev.tenant_id::text,
        'x-webhook-signature', v_sig,
        'x-timestamp', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ'),
        'idempotency-key', v_ev.idempotency_key
      );
      perform net.http_post(url => v_ep.url, body => v_ev.payload, headers => v_headers);
      v_sent := v_sent + 1;
    end loop;

    v_after := v_ev.attempts + 1;
    if v_sent > 0 then
      update public.outbox_events
        set attempts = attempts + 1, status = 'sent', sent_at = now()
        where id = v_ev.id;
    else
      if v_after >= 5 then
        update public.outbox_events
          set attempts = attempts + 1, status = 'dead', last_error = 'no active endpoint'
          where id = v_ev.id;
      else
        update public.outbox_events
          set attempts = attempts + 1,
              next_retry_at = now() + make_interval(mins => power(2, v_after) :: integer),
              last_error = 'no active endpoint'
          where id = v_ev.id;
      end if;
    end if;
  end loop;
  return 1;
end;
$$;

create policy "profiles_select_own" on public.profiles
  for select using (user_id = auth.uid() or public.is_platform_admin());
create policy "profiles_update_own" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "tenants_select" on public.tenants
  for select using (public.can(id, 'read_only') or public.is_platform_admin());
create policy "tenants_update" on public.tenants
  for update using (public.can(id, 'manager') or public.is_platform_admin())
    with check (public.can(id, 'manager') or public.is_platform_admin());
create policy "tenants_insert_platform" on public.tenants
  for insert with check (public.is_platform_admin());

create policy "members_select" on public.tenant_members
  for select using (public.can(tenant_id, 'read_only') or public.is_platform_admin());
create policy "members_insert" on public.tenant_members
  for insert with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "members_update" on public.tenant_members
  for update using (public.can(tenant_id, 'manager') or public.is_platform_admin())
    with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "members_delete" on public.tenant_members
  for delete using (public.can(tenant_id, 'manager') or public.is_platform_admin());

create policy "invitations_select" on public.invitations
  for select using (
    public.can(tenant_id, 'read_only')
    or public.is_platform_admin()
    or (status = 'pending' and email = auth.jwt() ->> 'email')
  );
create policy "invitations_insert" on public.invitations
  for insert with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "invitations_update" on public.invitations
  for update using (public.can(tenant_id, 'manager') or public.is_platform_admin())
    with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "invitations_delete" on public.invitations
  for delete using (public.can(tenant_id, 'manager') or public.is_platform_admin());

create policy "categories_select" on public.categories
  for select using (public.can(tenant_id, 'read_only') or public.is_platform_admin());
create policy "categories_insert" on public.categories
  for insert with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "categories_update" on public.categories
  for update using (public.can(tenant_id, 'manager') or public.is_platform_admin())
    with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "categories_delete" on public.categories
  for delete using (public.can(tenant_id, 'manager') or public.is_platform_admin());

create policy "products_select" on public.products
  for select using (public.can(tenant_id, 'read_only') or public.is_platform_admin());
create policy "products_insert" on public.products
  for insert with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "products_update" on public.products
  for update using (public.can(tenant_id, 'manager') or public.is_platform_admin())
    with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "products_delete" on public.products
  for delete using (public.can(tenant_id, 'manager') or public.is_platform_admin());

create policy "variants_select" on public.variants
  for select using (public.can(tenant_id, 'read_only') or public.is_platform_admin());
create policy "variants_insert" on public.variants
  for insert with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "variants_update" on public.variants
  for update using (public.can(tenant_id, 'manager') or public.is_platform_admin())
    with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "variants_delete" on public.variants
  for delete using (public.can(tenant_id, 'manager') or public.is_platform_admin());

create policy "locations_select" on public.locations
  for select using (public.can(tenant_id, 'read_only') or public.is_platform_admin());
create policy "locations_insert" on public.locations
  for insert with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "locations_update" on public.locations
  for update using (public.can(tenant_id, 'manager') or public.is_platform_admin())
    with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "locations_delete" on public.locations
  for delete using (public.can(tenant_id, 'manager') or public.is_platform_admin());

create policy "stock_levels_select" on public.stock_levels
  for select using (public.can(tenant_id, 'read_only') or public.is_platform_admin());

create policy "stock_transactions_select" on public.stock_transactions
  for select using (public.can(tenant_id, 'read_only') or public.is_platform_admin());

create policy "orders_select" on public.orders
  for select using (public.can(tenant_id, 'read_only') or public.is_platform_admin());

create policy "order_items_select" on public.order_items
  for select using (public.can(tenant_id, 'read_only') or public.is_platform_admin());

create policy "alerts_select" on public.low_stock_alerts
  for select using (public.can(tenant_id, 'read_only') or public.is_platform_admin());
create policy "alerts_update" on public.low_stock_alerts
  for update using (public.can(tenant_id, 'manager') or public.is_platform_admin())
    with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "alerts_delete" on public.low_stock_alerts
  for delete using (public.can(tenant_id, 'manager') or public.is_platform_admin());

create policy "audit_select" on public.audit_logs
  for select using (
    (tenant_id is not null and public.can(tenant_id, 'staff'))
    or public.is_platform_admin()
  );

create policy "api_keys_select" on public.api_keys
  for select using (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "api_keys_insert" on public.api_keys
  for insert with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "api_keys_update" on public.api_keys
  for update using (public.can(tenant_id, 'manager') or public.is_platform_admin())
    with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "api_keys_delete" on public.api_keys
  for delete using (public.can(tenant_id, 'manager') or public.is_platform_admin());

create policy "webhooks_select" on public.webhook_endpoints
  for select using (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "webhooks_insert" on public.webhook_endpoints
  for insert with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "webhooks_update" on public.webhook_endpoints
  for update using (public.can(tenant_id, 'manager') or public.is_platform_admin())
    with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "webhooks_delete" on public.webhook_endpoints
  for delete using (public.can(tenant_id, 'manager') or public.is_platform_admin());

create policy "widgets_select" on public.widget_configs
  for select using (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "widgets_insert" on public.widget_configs
  for insert with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "widgets_update" on public.widget_configs
  for update using (public.can(tenant_id, 'manager') or public.is_platform_admin())
    with check (public.can(tenant_id, 'manager') or public.is_platform_admin());
create policy "widgets_delete" on public.widget_configs
  for delete using (public.can(tenant_id, 'manager') or public.is_platform_admin());

create policy "outbox_select" on public.outbox_events
  for select using (public.can(tenant_id, 'manager') or public.is_platform_admin());

revoke all on all tables in schema public from anon;
revoke all on all routines in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all routines in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tenant_members to authenticated;
grant select, update on public.tenants to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.variants to authenticated;
grant select, insert, update, delete on public.locations to authenticated;
grant select on public.stock_levels to authenticated;
grant select on public.stock_transactions to authenticated;
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select, update on public.low_stock_alerts to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update, delete on public.api_keys to authenticated;
grant select, insert, update, delete on public.webhook_endpoints to authenticated;
grant select, update on public.widget_configs to authenticated;
grant select on public.outbox_events to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;

grant all on public.tenants to service_role;
grant all on public.tenant_members to service_role;
grant all on public.categories to service_role;
grant all on public.products to service_role;
grant all on public.variants to service_role;
grant all on public.locations to service_role;
grant all on public.stock_levels to service_role;
grant all on public.stock_transactions to service_role;
grant all on public.orders to service_role;
grant all on public.order_items to service_role;
grant all on public.low_stock_alerts to service_role;
grant all on public.audit_logs to service_role;
grant all on public.api_keys to service_role;
grant all on public.webhook_endpoints to service_role;
grant all on public.widget_configs to service_role;
grant all on public.outbox_events to service_role;
grant all on public.profiles to service_role;
grant all on public.invitations to service_role;

grant execute on function public.member_role(uuid) to public;
grant execute on function public.role_weight(text) to public;
grant execute on function public.can(uuid, text) to public;
grant execute on function public.is_platform_admin() to public;
grant execute on function public.widget_stock(text) to anon;
grant execute on function public.widget_stock(text) to authenticated;
grant execute on function public.create_tenant(text, text, text, text, text) to authenticated;
grant execute on function public.accept_invitation() to authenticated;
grant execute on function public.apply_stock_change(uuid, uuid, numeric, text, text, uuid, text, text, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.create_order(jsonb, text, text, text, text, text, text, uuid, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.update_order_status(uuid, text, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.set_stock_threshold(uuid, uuid, numeric, uuid) to authenticated, service_role;
revoke execute on function public.dispatch_outbox(integer) from public;
grant execute on function public.dispatch_outbox(integer) to postgres, service_role;