import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(','));
  }
  return lines.join('\n');
}

function fileName(type: string): string {
  return `inventory-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  if (!['stock-value', 'movements', 'low-stock'].includes(type)) {
    return NextResponse.json({ error: 'UNKNOWN_REPORT' }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const selected = cookieStore.get('tenant_id')?.value;
  const { data: members } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id);
  const tenantId = selected ?? members?.[0]?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: 'NO_TENANT' }, { status: 400 });
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('currency')
    .eq('id', tenantId)
    .single();

  let csv = '';

  if (type === 'stock-value') {
    const { data: rows } = await supabase
      .from('stock_levels')
      .select('*, variants(sku, name, cost), locations(name)')
      .eq('tenant_id', tenantId) as any;
    csv = toCsv(
      ['sku', 'variant', 'location', 'quantity_on_hand', 'cost', 'value', 'currency'],
      (rows ?? []).map((r: any) => [
        r.variants?.sku,
        r.variants?.name,
        r.locations?.name,
        r.quantity_on_hand,
        r.variants?.cost,
        Number(r.quantity_on_hand) * Number(r.variants?.cost ?? 0),
        tenant?.currency,
      ]),
    );
  } else if (type === 'movements') {
    const { data: rows } = await supabase
      .from('stock_transactions')
      .select('*, variants(sku, name), locations(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5000) as any;
    csv = toCsv(
      ['date', 'sku', 'variant', 'location', 'change', 'after', 'type', 'reference', 'actor', 'notes'],
      (rows ?? []).map((r: any) => [
        r.created_at,
        r.variants?.sku,
        r.variants?.name,
        r.locations?.name,
        r.change_qty,
        r.qty_after,
        r.transaction_type,
        r.reference_type,
        r.actor_name,
        r.notes,
      ]),
    );
  } else {
    const { data: rows } = await supabase
      .from('stock_levels')
      .select('*, variants(sku, name), locations(name)')
      .eq('tenant_id', tenantId)
      .gt('low_stock_threshold', 0) as any;
    const filtered = (rows ?? []).filter(
      (r: any) => Number(r.quantity_available) <= Number(r.low_stock_threshold),
    );
    csv = toCsv(
      ['sku', 'variant', 'location', 'on_hand', 'available', 'threshold', 'status'],
      filtered.map((r: any) => [
        r.variants?.sku,
        r.variants?.name,
        r.locations?.name,
        r.quantity_on_hand,
        r.quantity_available,
        r.low_stock_threshold,
        Number(r.quantity_available) <= 0 ? 'out_of_stock' : 'low_stock',
      ]),
    );
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName(type)}"`,
    },
  });
}