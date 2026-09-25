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

const DEMO = {
  name: 'Demo Store',
  slug: 'demo-store',
  owner: 'demo.owner@example.in',
  password: 'Demo@2026!Store',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  gstin: '27ABCDE1234F1Z5',
  state_code: '27',
  upi_id: 'demo@okhdfcbank',
  phone: '+91 98765 43210',
  address_line1: '12 MG Road',
  address_line2: 'Bandra West',
  city: 'Mumbai',
  postal_code: '400050',
  tax_rate: 18,
  enable_tax: true,
  invoice_prefix: 'DEM',
};

const CATALOG = [
  {
    category: 'Electronics',
    product: 'Wireless Headphones',
    variants: [
      { sku: 'WH-AIR', name: 'AuraPro Headphones', price: 2499, opening: 20, threshold: 5 },
      { sku: 'SPK-BT', name: 'BeatBox Speaker', price: 1999, opening: 8, threshold: 10 },
    ],
  },
  {
    category: 'Accessories',
    product: 'Charging Cable',
    variants: [
      { sku: 'CBL-C2', name: 'USB-C Cable 1m', price: 299, opening: 50, threshold: 10 },
      { sku: 'STD-PH', name: 'Phone Stand', price: 499, opening: 3, threshold: 5 },
    ],
  },
];

async function main() {
  const { data: existing } = await admin
    .from('tenants')
    .select('id, name')
    .eq('slug', DEMO.slug)
    .maybeSingle();
  if (existing) {
    console.error(`Tenant "${DEMO.slug}" already exists (${existing.id}). Remove it or pick a new slug.`);
    process.exit(1);
  }

  const { data: createdUser } = await admin.auth.admin.createUser({
    email: DEMO.owner,
    password: DEMO.password,
    email_confirm: true,
    user_metadata: { display_name: 'Demo Owner' },
  });
  const user = createdUser?.user;
  if (!user) throw new Error('createUser returned no user');

  const { data: tenant, error: tenantErr } = await admin
    .from('tenants')
    .insert({
      name: DEMO.name,
      slug: DEMO.slug,
      currency: DEMO.currency,
      timezone: DEMO.timezone,
      gstin: DEMO.gstin,
      state_code: DEMO.state_code,
      upi_id: DEMO.upi_id,
      phone: DEMO.phone,
      address_line1: DEMO.address_line1,
      address_line2: DEMO.address_line2,
      city: DEMO.city,
      postal_code: DEMO.postal_code,
      tax_rate: DEMO.tax_rate,
      enable_tax: DEMO.enable_tax,
      invoice_prefix: DEMO.invoice_prefix,
    })
    .select('id')
    .single();
  if (tenantErr) throw tenantErr;

  const { error: memberErr } = await admin.from('tenant_members').insert({
    tenant_id: tenant.id,
    user_id: user.id,
    role: 'owner',
  });
  if (memberErr) throw memberErr;

  const { data: location, error: locErr } = await admin
    .from('locations')
    .insert({ tenant_id: tenant.id, name: 'Main Store', location_type: 'store', city: DEMO.city })
    .select('id')
    .single();
  if (locErr) throw locErr;

  const rawKey = 'inv_' + randomBytes(24).toString('hex');
  const { error: keyErr } = await admin.from('api_keys').insert({
    tenant_id: tenant.id,
    name: 'Demo storefront',
    key_prefix: rawKey.slice(0, 10),
    key_hash: createHash('sha256').update(rawKey).digest('hex'),
    scopes: ['stock:read', 'stock:write', 'products:read', 'orders:read', 'orders:write'],
  });
  if (keyErr) throw keyErr;

  const { error: widgetErr } = await admin.from('widget_configs').insert({
    tenant_id: tenant.id,
    widget_key: 'demo-store',
    title: 'Demo Store — Live Stock',
  });
  if (widgetErr) throw widgetErr;

  let variantCount = 0;
  for (const group of CATALOG) {
    const { data: category, error: catErr } = await admin
      .from('categories')
      .insert({ tenant_id: tenant.id, name: group.category })
      .select('id')
      .single();
    if (catErr) throw catErr;

    const { data: product, error: prodErr } = await admin
      .from('products')
      .insert({ tenant_id: tenant.id, category_id: category.id, name: group.product })
      .select('id')
      .single();
    if (prodErr) throw prodErr;

    for (const v of group.variants) {
      const { data: variant, error: varErr } = await admin
        .from('variants')
        .insert({
          tenant_id: tenant.id,
          product_id: product.id,
          sku: v.sku,
          name: v.name,
          price: v.price,
        })
        .select('id')
        .single();
      if (varErr) throw varErr;

      const { error: stockErr } = await admin.rpc('apply_stock_change', {
        p_location_id: location.id,
        p_variant_id: variant.id,
        p_change_qty: v.opening,
        p_transaction_type: 'opening_balance',
        p_notes: 'Fresh demo seeding',
        p_actor_name: 'demo-seed',
        p_tenant_id: tenant.id,
      });
      if (stockErr) throw stockErr;

      const { error: thrErr } = await admin
        .from('stock_levels')
        .update({ low_stock_threshold: v.threshold })
        .eq('tenant_id', tenant.id)
        .eq('variant_id', variant.id)
        .eq('location_id', location.id);
      if (thrErr) throw thrErr;
      variantCount++;
    }
  }

  const { data: variantRows, error: listErr } = await admin
    .from('variants')
    .select('id, sku')
    .eq('tenant_id', tenant.id);
  if (listErr) throw listErr;

  const billingMeta = {
    shop_name: DEMO.name,
    gstin: DEMO.gstin,
    upi_id: DEMO.upi_id,
    phone: DEMO.phone,
    address: [DEMO.address_line1, DEMO.address_line2, DEMO.city, DEMO.postal_code].filter(Boolean).join(', '),
    invoice_prefix: DEMO.invoice_prefix,
    tax_rate: DEMO.tax_rate,
    state_code: DEMO.state_code,
  };

  const sampleOrders = [
    { n: 'Rahul Sharma', email: 'rahul@example.com', items: [0, 1], qty: [1, 2], status: 'fulfilled' },
    { n: 'Priya Patel', email: 'priya@example.com', items: [2, 3], qty: [3, 1], status: 'paid' },
    { n: 'Amit Verma', email: 'amit@example.com', items: [1], qty: [1], status: 'pending' },
    { n: 'Neha Gupta', email: 'neha@example.com', items: [0, 2], qty: [2, 5], status: 'cancelled' },
    { n: 'Rohan Desai', email: 'rohan@example.com', items: [3, 1], qty: [2, 1], status: 'fulfilled' },
  ];

  for (let i = 0; i < sampleOrders.length; i++) {
    const o = sampleOrders[i];
    const items = o.items.map((vi, idx) => ({
      variant_id: variantRows[vi].id,
      location_id: location.id,
      quantity: o.qty[idx],
    }));
    const { error: orderErr } = await admin.rpc('create_order', {
      p_items: items,
      p_customer_name: o.n,
      p_customer_email: o.email,
      p_currency: 'INR',
      p_source: 'pos',
      p_idempotency_key: 'demo-order-' + (i + 1),
      p_notes: 'Created by fresh demo seed',
      p_actor_name: 'demo-seed',
      p_tenant_id: tenant.id,
      p_tax_rate: DEMO.tax_rate,
      p_billing_meta: billingMeta,
    });
    if (orderErr) throw orderErr;

    if (o.status !== 'pending') {
      const { data: order, error: findErr } = await admin
        .from('orders')
        .select('id')
        .eq('idempotency_key', 'demo-order-' + (i + 1))
        .single();
      if (findErr) throw findErr;
      const { error: statusErr } = await admin.rpc('update_order_status', {
        p_order_id: order.id,
        p_status: o.status,
        p_actor_name: 'demo-seed',
        p_tenant_id: tenant.id,
      });
      if (statusErr) throw statusErr;
    }
  }

  console.log('Fresh demo tenant created:');
  console.log(`  name:        ${DEMO.name}`);
  console.log(`  tenant_id:   ${tenant.id}`);
  console.log(`  location_id: ${location.id}`);
  console.log(`  login:       ${DEMO.owner}`);
  console.log(`  password:    ${DEMO.password}`);
  console.log(`  API key:     ${rawKey}`);
  console.log(`  widget key:  demo-store`);
  console.log(`  variants:    ${variantCount}`);
  console.log(`  orders:      ${sampleOrders.length}`);
}

main().catch((err) => {
  console.error('Seed failed:', err.message ?? err);
  process.exit(1);
});