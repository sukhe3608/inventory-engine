import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env first.');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const tenantA = {
  name: 'Acme Fashion',
  slug: 'acme-fashion',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  owner: 'owner1@example.in',
  password: 'DemoPass123!',
};

const tenantB = {
  name: 'GreenLeaf Grocers',
  slug: 'greenleaf-grocers',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  owner: 'owner2@example.in',
  password: 'DemoPass123!',
};

async function createUser(email, password, displayName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw error;
  return data.user;
}

async function createTenant(t) {
  const { data: tenantCheck, error: checkErr } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', t.slug)
    .maybeSingle();
  if (checkErr) throw checkErr;
  if (tenantCheck) {
    console.log(`Tenant ${t.slug} already exists, skipping demo seeding.`);
    return;
  }

  const user = await createUser(t.owner, t.password, t.name.split(' ')[0]);

  const { data: tenant, error: tenantErr } = await admin
    .from('tenants')
    .insert({ name: t.name, slug: t.slug, currency: t.currency, timezone: t.timezone })
    .select('id')
    .single();
  if (tenantErr) throw tenantErr;

  const { error: memberErr } = await admin
    .from('tenant_members')
    .insert({ tenant_id: tenant.id, user_id: user.id, role: 'owner' });
  if (memberErr) throw memberErr;

  const { data: location, error: locErr } = await admin
    .from('locations')
    .insert({ tenant_id: tenant.id, name: 'Main Store', location_type: 'store', city: 'Mumbai' })
    .select('id')
    .single();
  if (locErr) throw locErr;

  const rawKey = 'inv_' + randomBytes(24).toString('hex');
  const { error: keyErr } = await admin.from('api_keys').insert({
    tenant_id: tenant.id,
    name: 'Demo storefront',
    key_prefix: rawKey.slice(0, 10),
    key_hash: createHash('sha256').update(rawKey).digest('hex'),
    scopes: ['stock:read', 'stock:write', 'orders:write', 'products:read'],
  });
  if (keyErr) throw keyErr;

  const { error: widgetErr } = await admin.from('widget_configs').insert({
    tenant_id: tenant.id,
    widget_key: 'demo-' + t.slug,
  });
  if (widgetErr) throw widgetErr;

  const { data: widget, error: widgetListErr } = await admin
    .from('widget_configs')
    .select('widget_key')
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (widgetListErr) throw widgetListErr;
  const widgetKey = widget ? widget.widget_key : null;

  const categories = t.slug === 'acme-fashion'
    ? [{ tenant_id: tenant.id, name: 'Apparel' }, { tenant_id: tenant.id, name: 'Accessories' }]
    : [{ tenant_id: tenant.id, name: 'Produce' }, { tenant_id: tenant.id, name: 'Pantry' }];

  for (const cat of categories) {
    const { data: category, error: catErr } = await admin.from('categories').insert(cat).select('id').single();
    if (catErr) throw catErr;
    const { error: prodErr } = await admin.from('products').insert({
      tenant_id: tenant.id,
      category_id: category.id,
      name: t.slug === 'acme-fashion' ? 'Stripe Tee' : 'Basmati Rice',
    });
    if (prodErr) throw prodErr;
  }

  const { data: products, error: prodListErr } = await admin
    .from('products')
    .select('id, name')
    .eq('tenant_id', tenant.id);
  if (prodListErr) throw prodListErr;

  const sampleVariants = t.slug === 'acme-fashion'
    ? [
        { sku: 'STRIPE-M', name: 'Stripe Tee / M', price: 699, color: 'Maroon', opening: 25 },
        { sku: 'STRIPE-L', name: 'Stripe Tee / L', price: 699, color: 'Maroon', opening: 18 },
        { sku: 'CAP-ONE', name: 'Cotton Cap', price: 349, color: 'Black', opening: 5 },
      ]
    : [
        { sku: 'RICE-5KG', name: 'Basmati Rice 5kg', price: 620, color: null, opening: 40 },
        { sku: 'RICE-1KG', name: 'Basmati Rice 1kg', price: 135, color: null, opening: 12 },
      ];

  for (const [idx, sv] of sampleVariants.entries()) {
    const productId = products[idx % products.length].id;
    const { data: variant, error: varErr } = await admin.from('variants').insert({
      tenant_id: tenant.id,
      product_id: productId,
      sku: sv.sku,
      name: sv.name,
      price: sv.price,
      attributes: sv.color ? { color: sv.color } : {},
    }).select('id').single();
    if (varErr) throw varErr;

    const { error: stockErr } = await admin.rpc('apply_stock_change', {
      p_location_id: location.id,
      p_variant_id: variant.id,
      p_change_qty: sv.opening,
      p_transaction_type: 'opening_balance',
      p_notes: 'Demo opening balance',
      p_actor_name: 'demo-seed',
      p_tenant_id: tenant.id,
    });
    if (stockErr) throw stockErr;

    await admin.from('stock_levels').update({ low_stock_threshold: sv.opening <= 5 ? 8 : 10 })
      .eq('tenant_id', tenant.id).eq('variant_id', variant.id).eq('location_id', location.id);
  }

  console.log(`Seeded tenant "${t.name}"`);
  console.log(`  login: ${t.owner} / ${t.password}`);
  console.log(`  API key: ${rawKey}`);
  console.log(`  widget key: ${widgetKey}`);
  console.log(`  location id: ${location.id}`);
}

await createTenant(tenantA);
await createTenant(tenantB);
console.log('Demo seed complete.');