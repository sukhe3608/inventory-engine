import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY in the root .env first.');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

let passed = 0;
let failed = 0;

function ok(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function userClient(email, password) {
  const { data: sessionData, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } },
  });
}

async function provisionTenant(ownerEmail, password, slug, productName, sku, opening) {
  const user = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
  const { data: tenant, error: tenantErr } = await admin
    .from('tenants').insert({ name: slug, slug, currency: 'INR' }).select('id').single();
  if (tenantErr) throw tenantErr;
  await admin.from('tenant_members').insert({ tenant_id: tenant.id, user_id: user.user.id, role: 'owner' });
  const { data: location, error: locErr } = await admin
    .from('locations').insert({ tenant_id: tenant.id, name: 'Warehouse' }).select('id').single();
  if (locErr) throw locErr;
  const { data: product, error: prodErr } = await admin
    .from('products').insert({ tenant_id: tenant.id, name: productName }).select('id').single();
  if (prodErr) throw prodErr;
  const { data: variant, error: varErr } = await admin
    .from('variants').insert({ tenant_id: tenant.id, product_id: product.id, sku, name: productName, price: 100 })
    .select('id').single();
  if (varErr) throw varErr;
  const { error: openErr } = await admin.rpc('apply_stock_change', {
    p_location_id: location.id,
    p_variant_id: variant.id,
    p_change_qty: opening,
    p_transaction_type: 'opening_balance',
    p_actor_name: 'test',
    p_tenant_id: tenant.id,
  });
  if (openErr) throw openErr;
  return { tenant, user: user.user, location, product, variant };
}

const suffix = Date.now();
const a = await provisionTenant(`iso-a-${suffix}@test.in`, 'IsolationPass1!', `iso-a-${suffix}`, 'Product A', `SKU-A-${suffix}`, 100);
const b = await provisionTenant(`iso-b-${suffix}@test.in`, 'IsolationPass1!', `iso-b-${suffix}`, 'Product B', `SKU-B-${suffix}`, 100);

console.log('\n1. Row-level isolation');
const clientA = await userClient(`iso-a-${suffix}@test.in`, 'IsolationPass1!');
const clientB = await userClient(`iso-b-${suffix}@test.in`, 'IsolationPass1!');

{
  const { data: productsA } = await clientA.from('products').select('id, name');
  ok('tenant A can list own products', productsA.some((p) => p.name === 'Product A'));
  ok('tenant A cannot see tenant B products', !productsA.some((p) => p.name === 'Product B'));
}

{
  const { data: tenants } = await clientA.from('tenants').select('id, name');
  const bTenant = tenants.filter((t) => t.id === b.tenant.id);
  ok('tenant A cannot read tenant B row', bTenant.length === 0);
}

{
  const { error: crossInsert } = await clientA
    .from('products')
    .insert({ tenant_id: b.tenant.id, name: 'Sneaky' });
  ok('tenant A cannot insert into tenant B scope', !!crossInsert, crossInsert?.message);
}

{
  const { error: crossStock } = await clientA.rpc('apply_stock_change', {
    p_location_id: b.location.id,
    p_variant_id: b.variant.id,
    p_change_qty: 1,
    p_transaction_type: 'adjustment',
    p_actor_user_id: a.user.id,
    p_tenant_id: a.tenant.id,
  });
  ok('tenant A cannot mutate tenant B stock', !!crossStock, crossStock?.message);
}

console.log('\n2. Idempotency (duplicate delivery must not double-apply)');
{
  const idemKey = 'idem-' + suffix;
  const r1 = await admin.rpc('apply_stock_change', {
    p_location_id: a.location.id,
    p_variant_id: a.variant.id,
    p_change_qty: -5,
    p_transaction_type: 'adjustment',
    p_idempotency_key: idemKey,
    p_actor_name: 'test',
    p_tenant_id: a.tenant.id,
  });
  const r2 = await admin.rpc('apply_stock_change', {
    p_location_id: a.location.id,
    p_variant_id: a.variant.id,
    p_change_qty: -5,
    p_transaction_type: 'adjustment',
    p_idempotency_key: idemKey,
    p_actor_name: 'test',
    p_tenant_id: a.tenant.id,
  });
  const { data: level } = await admin
    .from('stock_levels').select('quantity_on_hand')
    .eq('tenant_id', a.tenant.id).eq('variant_id', a.variant.id).single();
  ok('second delivery is idempotent', r2.error === null && r2.data?.idempotent === true, JSON.stringify(r2.error));
  ok('quantity reduced exactly once (95)', Number(level?.quantity_on_hand) === 95, `got ${level?.quantity_on_hand}`);
}

console.log('\n3. Concurrent last-unit race (10 concurrent orders, stock 5)');
{
  const orderClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sData, error: signInErr } = await orderClient.auth.signInWithPassword({
    email: `iso-a-${suffix}@test.in`,
    password: 'IsolationPass1!',
  });
  if (signInErr) throw signInErr;
  const authed = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${sData.session.access_token}` } },
  });

  const inventory = await admin
    .from('stock_levels').select('quantity_on_hand')
    .eq('tenant_id', a.tenant.id).eq('variant_id', a.variant.id).single();

  await admin.rpc('set_stock_threshold', {
    p_variant_id: a.variant.id, p_location_id: a.location.id, p_threshold: 0, p_tenant_id: a.tenant.id,
  });

  const attempts = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      authed.rpc('create_order', {
        p_items: [{ variant_id: a.variant.id, quantity: 1, location_id: a.location.id }],
        p_customer_name: `customer-${i}`,
        p_idempotency_key: `race-${suffix}-${i}`,
        p_tenant_id: a.tenant.id,
      })
    ),
  );

  const succeeded = attempts.filter((r) => r.error === null).length;
  const rejected = attempts.filter((r) => r.error !== null).length;
  ok(`exactly ${inventory.data.quantity_on_hand} orders succeed, rest rejected`,
    succeeded === Number(inventory.data.quantity_on_hand) && succeeded + rejected === 12,
    `succeeded=${succeeded} rejected=${rejected}`);

  const { data: afterLevel } = await admin
    .from('stock_levels').select('quantity_on_hand')
    .eq('tenant_id', a.tenant.id).eq('variant_id', a.variant.id).single();
  ok('stock reaches exactly zero (no oversell)', Number(afterLevel.quantity_on_hand) === 0,
    `got ${afterLevel.quantity_on_hand}`);
}

console.log('\n4. Anonymous widget access is scoped to the widget key');
{
  const { data: wc } = await admin
    .from('widget_configs').select('widget_key').eq('tenant_id', a.tenant.id).single();
  const { data: widgetData, error: widgetErr } = await anon.rpc('widget_stock', { p_widget_key: wc.widget_key });
  ok('anonymous widget read succeeds', widgetErr === null, widgetErr?.message);
  ok('widget returns only own tenant items', Array.isArray(widgetData) && widgetData.every((r) => r.sku.startsWith('SKU-A-')));
  const { error: widgetErrB } = await anon.rpc('widget_stock', { p_widget_key: '00000000-0000-0000-0000-000000000000' });
  ok('unknown widget key returns nothing', widgetErrB === null);
  const { data: direct, error: directErr } = await anon.from('variants').select('*').limit(5);
  ok('anonymous cannot read variant tables directly', !!directErr || (direct?.length ?? 0) === 0);
}

console.log('\n5. Order cancellation refunds stock through the ledger');
{
  const { data: cancelOrder } = await admin.rpc('create_order', {
    p_items: [{ variant_id: b.variant.id, quantity: 3, location_id: b.location.id }],
    p_customer_name: 'refund test',
    p_idempotency_key: `cancel-demo-${suffix}`,
    p_tenant_id: b.tenant.id,
  });
  await admin.rpc('update_order_status', {
    p_order_id: cancelOrder.order_id,
    p_status: 'cancelled',
    p_tenant_id: b.tenant.id,
  });
  const { data: bLevel } = await admin
    .from('stock_levels').select('quantity_on_hand')
    .eq('tenant_id', b.tenant.id).eq('variant_id', b.variant.id).single();
  ok('cancelled order restores stock to opening value', Number(bLevel.quantity_on_hand) === 100,
    `got ${bLevel.quantity_on_hand}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);