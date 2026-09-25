'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/app/provider';
import { Card, CardHeader, Button, Badge, Field, inputClass, Modal, Empty } from '@/components/ui';
import { getWord, type WordKey } from '@/lib/i18n';
import { formatMoney, formatDate } from '@/lib/format';
import type { OrderRow, OrderItemRow, VariantRow, LocationRow, TenantRow, BillingMeta } from '@/lib/types';
import { computeTotals, buildBillingMeta, type CartLine } from '@/lib/billing';
import { BillDocument, type BillData } from '@/components/billing/BillDocument';

interface FlatOrder extends OrderRow {
  items?: OrderItemRow[];
}

export default function OrdersPage() {
  const app = useApp();
  const w = (k: WordKey) => getWord(app.language, k);
  const canOperate = ['owner', 'manager', 'staff'].includes(app.role);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [newOrder, setNewOrder] = useState(false);
  const [lines, setLines] = useState<{ variantId: string; qty: string; price: string; locationId: string }[]>([
    { variantId: '', qty: '1', price: '', locationId: '' },
  ]);
  const [customer, setCustomer] = useState({ name: '', email: '' });
  const [discount, setDiscount] = useState('0');
  const [discountIsPercent, setDiscountIsPercent] = useState(true);
  const [taxRate, setTaxRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [billFor, setBillFor] = useState<OrderRow | null>(null);

  const load = useCallback(async () => {
    const sb = app.supabase;
    const tenantId = app.tenantId;
    const [ordRes, varRes, locRes, tenRes] = await Promise.all([
      sb.from('orders').select('*, order_items(*)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100) as any,
      sb.from('variants').select('*').eq('tenant_id', tenantId).eq('active', true).order('sku'),
      sb.from('locations').select('*').eq('tenant_id', tenantId).order('name'),
      sb.from('tenants').select('*').eq('id', tenantId).single(),
    ]);
    setOrders((ordRes.data ?? []) as OrderRow[]);
    setVariants((varRes.data ?? []) as VariantRow[]);
    setLocations((locRes.data ?? []) as LocationRow[]);
    const t = (tenRes.data ?? null) as TenantRow | null;
    setTenant(t);
    setTaxRate(String(t?.enable_tax ? t.tax_rate : 0));
    setLoading(false);
  }, [app.supabase, app.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createOrder() {
    const items = lines
      .filter((l) => l.variantId && Number(l.qty) > 0)
      .map((l) => ({
        variant_id: l.variantId,
        quantity: Number(l.qty),
        unit_price: l.price ? Number(l.price) : undefined,
        location_id: l.locationId || undefined,
      }));
    if (items.length === 0) return setError('Add at least one item');
    const cart: CartLine[] = items.map((it) => {
      const v = variants.find((x) => x.id === it.variant_id);
      return {
        variant: (v ?? { id: it.variant_id as string, sku: it.variant_id as string, name: null, price: it.unit_price ?? 0, active: true }) as VariantRow,
        qty: it.quantity,
        price: it.unit_price ?? 0,
      };
    });
    const totals = computeTotals(cart, { discount: Number(discount) || 0, discountIsPercent, taxRate: Number(taxRate) || null });
    const { error } = await app.supabase.rpc('create_order', {
      p_items: items,
      p_customer_name: customer.name.trim() || null,
      p_customer_email: customer.email.trim() || null,
      p_currency: app.currency,
      p_source: 'manual',
      p_tax_rate: totals.taxRate,
      p_discount: totals.discount,
      p_billing_meta: tenant ? buildBillingMeta(tenant) : { shop_name: app.tenantName },
      p_idempotency_key: crypto.randomUUID(),
      p_actor_user_id: app.user.id,
    });
    if (error) return setError(error.message);
    setNewOrder(false);
    setLines([{ variantId: '', qty: '1', price: '', locationId: '' }]);
    setCustomer({ name: '', email: '' });
    setDiscount('0');
    setTaxRate(String(tenant?.enable_tax ? tenant.tax_rate : 0));
    setError(null);
    load();
  }

  async function setStatus(order: OrderRow, status: string) {
    const { error } = await app.supabase.rpc('update_order_status', {
      p_order_id: order.id,
      p_status: status,
      p_actor_user_id: app.user.id,
    });
    if (error) return setError(error.message);
    setError(null);
    load();
  }

  function toBillData(order: OrderRow): BillData {
    const meta: BillingMeta = {
      shop_name: (order.billing_meta as any)?.shop_name ?? app.tenantName,
      ...((order.billing_meta as any) ?? {}),
    };
    const items =
      (order.items ?? []).map((it: OrderItemRow) => {
        const v = variants.find((x) => x.id === it.variant_id);
        return {
          name: v?.name ?? v?.sku ?? it.variant_id?.slice(0, 8),
          sku: v?.sku,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          subtotal: Number(it.subtotal),
        };
      }) ?? [];
    return {
      order_number: order.order_number,
      created_at: order.created_at,
      currency: order.currency,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_gstin: order.customer_gstin,
      subtotal: Number(order.subtotal ?? order.total),
      discount_amount: Number(order.discount_amount ?? 0),
      tax_rate: Number(order.tax_rate ?? 0),
      tax_amount: Number(order.tax_amount ?? 0),
      total: Number(order.total),
      billing_meta: meta,
      items,
    };
  }

  if (loading) return <p className="text-sm text-slate-400">{w('loading')}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{w('orders')}</h1>
        {canOperate && <Button onClick={() => setNewOrder(true)}>{w('newOrder')}</Button>}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card>
        <CardHeader title={w('orders')} />
        {orders.length === 0 ? (
          <Empty message="No orders yet" />
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map((o) => (
              <div key={o.id} className="p-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{o.order_number}</span>
                      <Badge tone={o.status === 'fulfilled' ? 'green' : o.status === 'cancelled' ? 'rose' : o.status === 'paid' ? 'blue' : 'slate'}>{o.status}</Badge>
                      <span className="text-xs text-slate-400">{formatDate(o.created_at, app.language)} · {o.source}</span>
                    </div>
                    <p className="text-sm text-slate-500">{o.customer_name || o.customer_email || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{formatMoney(Number(o.total), o.currency, app.language)}</span>
                    <Button variant="secondary" onClick={() => setBillFor(o)}>{w('bill')}</Button>
                    {canOperate && o.status !== 'cancelled' && o.status !== 'fulfilled' && (
                      <>
                        <Button variant="secondary" onClick={() => setStatus(o, 'paid')}>{w('markPaid')}</Button>
                        <Button variant="secondary" onClick={() => setStatus(o, 'fulfilled')}>{w('markFulfilled')}</Button>
                        <Button variant="ghost" onClick={() => setStatus(o, 'cancelled')}>{w('cancelOrder')}</Button>
                      </>
                    )}
                  </div>
                </div>
                {(o.items ?? []).length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <table className="w-full text-sm">
                      <tbody>
                        {(o.items ?? []).map((it) => (
                          <tr key={(it as any).id} className="text-slate-600">
                            <td className="py-1">{(it as any).variant_id?.slice(0, 8)}</td>
                            <td className="py-1 text-right tabular-nums">{(it as any).quantity} × {formatMoney(Number((it as any).unit_price), o.currency, app.language)}</td>
                            <td className="py-1 text-right tabular-nums">{formatMoney(Number((it as any).subtotal), o.currency, app.language)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={newOrder} onClose={() => setNewOrder(false)} title={w('newOrder')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer">
              <input className={inputClass} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input type="email" className={inputClass} value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
            </Field>
          </div>
          {lines.map((line, i) => {
            const selected = variants.find((v) => v.id === line.variantId);
            return (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1.2fr_auto] gap-2 items-center">
                <Field label={i === 0 ? 'Item' : ' '}>
                  <select className={inputClass} value={line.variantId}
                    onChange={(e) => {
                      const n = [...lines];
                      n[i].variantId = e.target.value;
                      const v = variants.find((x) => x.id === e.target.value);
                      if (v && !n[i].price) n[i].price = String(v.price);
                      setLines(n);
                    }}>
                    <option value="">Select…</option>
                    {variants.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
                  </select>
                </Field>
                <Field label={i === 0 ? 'Qty' : ' '}>
                  <input type="number" className={inputClass} value={line.qty} onChange={(e) => { const n = [...lines]; n[i].qty = e.target.value; setLines(n); }} />
                </Field>
                <Field label={i === 0 ? 'Price' : ' '}>
                  <input type="number" step="0.01" className={inputClass} value={line.price} onChange={(e) => { const n = [...lines]; n[i].price = e.target.value; setLines(n); }} />
                </Field>
                <Field label={i === 0 ? 'Location' : ' '}>
                  <select className={inputClass} value={line.locationId}
                    onChange={(e) => { const n = [...lines]; n[i].locationId = e.target.value; setLines(n); }}>
                    <option value="">Default</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
                <button className="text-slate-400 hover:text-rose-600 pt-4" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            );
          })}
          <Button variant="ghost" onClick={() => setLines([...lines, { variantId: '', qty: '1', price: '', locationId: '' }])}>+ Add line</Button>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Discount (${discountIsPercent ? '%' : app.currency})`}>
              <input type="number" min="0" step="any" className={inputClass} value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </Field>
            <div className="flex items-end gap-2">
              <Button size="sm" variant={discountIsPercent ? 'primary' : 'secondary'} onClick={() => setDiscountIsPercent(true)}>%</Button>
              <Button size="sm" variant={!discountIsPercent ? 'primary' : 'secondary'} onClick={() => setDiscountIsPercent(false)}>{app.currency}</Button>
            </div>
            <Field label="Tax rate %">
              <input type="number" min="0" max="100" step="any" className={inputClass} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </Field>
          </div>
          <OrderTotals lines={lines} variants={variants} discount={discount} discountIsPercent={discountIsPercent} taxRate={taxRate} currency={app.currency} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewOrder(false)}>{w('cancel')}</Button>
            <Button onClick={createOrder}>{w('create')}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!billFor} onClose={() => setBillFor(null)} title={`Bill — ${billFor?.order_number ?? ''}`} wide>
        {billFor && (
          <div className="space-y-4">
            <div className="bill-print-root">
              <div className="max-h-[62vh] overflow-y-auto">
                <BillDocument bill={toBillData(billFor)} language={app.language} />
              </div>
            </div>
            <div className="flex justify-end print:hidden">
              <Button variant="secondary" onClick={() => setBillFor(null)}>Close</Button>
              <Button onClick={() => window.print()}>{w('print')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function OrderTotals({
  lines,
  variants,
  discount,
  discountIsPercent,
  taxRate,
  currency,
}: {
  lines: { variantId: string; qty: string; price: string }[];
  variants: VariantRow[];
  discount: string;
  discountIsPercent: boolean;
  taxRate: string;
  currency: string;
}) {
  const app = useApp();
  const cart: CartLine[] = lines
    .filter((l) => l.variantId && Number(l.qty) > 0)
    .map((l) => {
      const v = variants.find((x) => x.id === l.variantId);
      return {
        variant: (v ?? { id: l.variantId, sku: l.variantId, name: null, price: Number(l.price) || 0, active: true }) as VariantRow,
        qty: Number(l.qty),
        price: Number(l.price) || (v ? Number(v.price) : 0),
      };
    });
  const totals = computeTotals(cart, { discount: Number(discount) || 0, discountIsPercent, taxRate: Number(taxRate) || null });
  const w = (k: WordKey) => getWord(app.language, k);
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-sm">
      <div className="flex justify-between text-slate-600"><span>{w('subtotal')}</span><span className="tabular-nums">{formatMoney(totals.subtotal, currency, app.language)}</span></div>
      {totals.discount > 0 && (
        <div className="flex justify-between text-slate-600"><span>{w('discount')}</span><span className="tabular-nums">− {formatMoney(totals.discount, currency, app.language)}</span></div>
      )}
      {totals.tax > 0 && (
        <>
          <div className="flex justify-between text-slate-600">
            <span>{w('cgst')} @ {Math.round(totals.taxRate / 2)}%</span>
            <span className="tabular-nums">{formatMoney(totals.cgst, currency, app.language)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>{w('sgst')} @ {Math.round(totals.taxRate / 2)}%</span>
            <span className="tabular-nums">{formatMoney(totals.sgst, currency, app.language)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between border-t border-slate-300 pt-2 font-bold text-slate-900">
        <span>{w('grandTotal')}</span>
        <span className="tabular-nums">{formatMoney(totals.total, currency, app.language)}</span>
      </div>
    </div>
  );
}