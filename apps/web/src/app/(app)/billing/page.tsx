'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/app/provider';
import { Button, Card, Field, inputClass, Modal } from '@/components/ui';
import { getWord, type WordKey } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import type { VariantRow, LocationRow, StockLevelRow, TenantRow, BillingMeta } from '@/lib/types';
import { computeTotals, buildBillingMeta, upiPaymentUrl, type CartLine } from '@/lib/billing';
import { UpiQr } from '@/components/billing/UpiQr';
import { BillDocument, type BillData, type BillItem } from '@/components/billing/BillDocument';

interface StockRow extends StockLevelRow {
  sku?: string;
}

export default function BillingPage() {
  const app = useApp();
  const w = (k: WordKey) => getWord(app.language, k);
  const canOperate = ['owner', 'manager', 'staff'].includes(app.role);

  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [tenant, setTenant] = useState<TenantRow | null>(null);

  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState({ name: '', email: '', gstin: '' });
  const [discount, setDiscount] = useState('0');
  const [discountIsPercent, setDiscountIsPercent] = useState(true);
  const [taxRate, setTaxRate] = useState('');
  const [locationId, setLocationId] = useState('');

  const [saved, setSaved] = useState<BillData | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const sb = app.supabase;
    const tenantId = app.tenantId;
    const [varRes, locRes, stkRes, tenRes] = await Promise.all([
      sb.from('variants').select('*').eq('tenant_id', tenantId).eq('active', true).order('sku'),
      sb.from('locations').select('*').eq('tenant_id', tenantId).order('name'),
      sb.from('stock_levels').select('*, variants!inner(sku)').eq('tenant_id', tenantId),
      sb.from('tenants').select('*').eq('id', tenantId).single(),
    ]);
    const vs = (varRes.data ?? []) as VariantRow[];
    setVariants(vs);
    setLocations((locRes.data ?? []) as LocationRow[]);
    const stockMap: Record<string, number> = {};
    for (const s of (stkRes.data ?? []) as StockRow[]) {
      stockMap[s.variant_id] = Math.max(0, Number(s.quantity_on_hand ?? 0)) + (stockMap[s.variant_id] ?? 0);
    }
    setStock(stockMap);
    const t = (tenRes.data ?? null) as TenantRow | null;
    setTenant(t);
    setTaxRate(String(t?.enable_tax ? t.tax_rate : 0));
    setLocationId(t?.default_location_id ?? '');
    setLoading(false);
  }, [app.supabase, app.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return variants;
    return variants.filter((v) => v.sku.toLowerCase().includes(q) || (v.name ?? '').toLowerCase().includes(q));
  }, [variants, query]);

  const totals = useMemo(
    () => computeTotals(lines, { discount: Number(discount) || 0, discountIsPercent, taxRate: Number(taxRate) }),
    [lines, discount, discountIsPercent, taxRate],
  );

  function addLine(variant: VariantRow) {
    setLines((prev) => {
      const existing = prev.find((l) => l.variant.id === variant.id);
      if (existing) {
        return prev.map((l) => (l.variant.id === variant.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { variant, qty: 1, price: Number(variant.price ?? 0) }];
    });
  }

  function updateLine(id: string, patch: Partial<CartLine>) {
    setLines((prev) => prev.map((l) => (l.variant.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.variant.id !== id));
  }

  function reset() {
    setLines([]);
    setCustomer({ name: '', email: '', gstin: '' });
    setDiscount('0');
    setDiscountIsPercent(true);
    setTaxRate(String(tenant?.enable_tax ? tenant.tax_rate : 0));
    setError(null);
    setSaved(null);
    setOrderId(null);
  }

  const billingMeta: BillingMeta = useMemo(() => (tenant ? buildBillingMeta(tenant) : {}), [tenant]);

  async function saveBill() {
    if (lines.length === 0) return setError('Cart is empty');
    setSaving(true);
    setError(null);
    const items = lines.map((l) => ({
      variant_id: l.variant.id,
      quantity: l.qty,
      unit_price: l.price,
      location_id: locationId || undefined,
    }));
    const { data, error: saveErr } = await app.supabase.rpc('create_order', {
      p_items: items,
      p_customer_name: customer.name.trim() || null,
      p_customer_email: customer.email.trim() || null,
      p_customer_gstin: customer.gstin.trim() || null,
      p_currency: app.currency,
      p_source: 'pos',
      p_tax_rate: totals.taxRate,
      p_discount: totals.discount,
      p_billing_meta: billingMeta,
      p_idempotency_key: crypto.randomUUID(),
      p_actor_user_id: app.user.id,
    });
    setSaving(false);
    if (saveErr) return setError(saveErr.message);
    if (!data) return setError('No response from server');

    const meta: BillingMeta = {
      ...billingMeta,
      invoice_prefix: billingMeta.invoice_prefix ?? 'INV',
    };
    const bill: BillData = {
      order_number: data.order_number,
      created_at: new Date().toISOString(),
      currency: data.currency ?? app.currency,
      customer_name: customer.name || null,
      customer_email: customer.email || null,
      customer_gstin: customer.gstin || null,
      subtotal: Number(data.subtotal),
      discount_amount: Number(data.discount_amount),
      tax_rate: Number(data.tax_rate),
      tax_amount: Number(data.tax_amount),
      total: Number(data.total),
      billing_meta: data.billing_meta ?? meta,
      items: lines.map((l) => ({
        name: l.variant.name ?? l.variant.sku,
        sku: l.variant.sku,
        quantity: l.qty,
        unit_price: l.price,
        subtotal: Math.round(l.price * l.qty * 100) / 100,
      })) as BillItem[],
    };
    setOrderId(data.order_id);
    setSaved(bill);
    setLines([]);
  }

  async function markPaid() {
    if (!orderId) return;
    const { error: markErr } = await app.supabase.rpc('update_order_status', {
      p_order_id: orderId,
      p_status: 'paid',
      p_actor_user_id: app.user.id,
    });
    if (markErr) return setError(markErr.message);
  }

  if (loading) return <p className="text-sm text-slate-400">{w('loading')}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{w('billing')}</h1>
        <div className="flex items-center gap-2">
          {lines.length > 0 && <Button variant="ghost" onClick={reset}>Reset</Button>}
          <Button onClick={saveBill} disabled={lines.length === 0 || saving}>
            {saving ? 'Saving…' : w('saveBill')}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {!canOperate ? (
        <Card className="p-6"><p className="text-sm text-slate-500">You don&apos;t have permission to bill.</p></Card>
      ) : (
        <div className="grid lg:grid-cols-[1fr_400px] gap-6 items-start">
          {/* Item picker */}
          <Card className="p-4">
            <div className="mb-3">
              <input
                className={inputClass}
                placeholder={`${w('search')} SKU / name…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="max-h-[62vh] overflow-y-auto pr-1 space-y-1">
              {filtered.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No products found. Add products in Products first.</p>}
              {filtered.map((v) => {
                const qty = stock[v.id] ?? 0;
                const out = qty <= 0;
                return (
                  <button
                    key={v.id}
                    disabled={out}
                    onClick={() => addLine(v)}
                    className="w-full flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-400 disabled:opacity-45 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{v.name ?? v.sku}</p>
                      <p className="text-xs text-slate-400">{v.sku} · in stock: {qty}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatMoney(Number(v.price ?? 0), app.currency, app.language)}</p>
                      <p className="text-xs text-emerald-600">+ Add</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Cart + calculator */}
          <Card className="p-4 space-y-4">
            {lines.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-slate-700">{w('emptyCart')}</p>
                <p className="text-xs text-slate-400 mt-1">{w('addFirstItem')}</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                  {lines.map((l) => (
                    <div key={l.variant.id} className="flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{l.variant.name ?? l.variant.sku}</p>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={`${inputClass} mt-1 !py-1 !px-2 text-xs`}
                          value={l.price}
                          onChange={(e) => updateLine(l.variant.id, { price: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="h-7 w-7 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100" onClick={() => updateLine(l.variant.id, { qty: Math.max(1, l.qty - 1) })}>−</button>
                        <span className="w-8 text-center tabular-nums">{l.qty}</span>
                        <button className="h-7 w-7 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100" onClick={() => updateLine(l.variant.id, { qty: l.qty + 1 })}>+</button>
                      </div>
                      <span className="w-20 text-right tabular-nums font-medium">{formatMoney(Math.round(l.price * l.qty * 100) / 100, app.currency, app.language)}</span>
                      <button className="text-slate-400 hover:text-rose-600" onClick={() => removeLine(l.variant.id)}>✕</button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label={w('customerName')}>
                    <input className={inputClass} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                  </Field>
                  <Field label={w('customerEmail')}>
                    <input type="email" className={inputClass} value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
                  </Field>
                  <Field label={w('customerGstin')}>
                    <input className={inputClass} value={customer.gstin} onChange={(e) => setCustomer({ ...customer, gstin: e.target.value })} />
                  </Field>
                  <Field label={w('location')}>
                    <select className={inputClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                      <option value="">Default</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-[1fr_1fr] gap-3">
                  <Field label={`${w('discount')} (${discountIsPercent ? '%' : app.currency})`}>
                    <input type="number" min="0" step="any" className={inputClass} value={discount} onChange={(e) => setDiscount(e.target.value)} />
                  </Field>
                  <div className="flex items-end gap-2">
                    <Button size="sm" variant={discountIsPercent ? 'primary' : 'secondary'} onClick={() => setDiscountIsPercent(true)}>%</Button>
                    <Button size="sm" variant={!discountIsPercent ? 'primary' : 'secondary'} onClick={() => setDiscountIsPercent(false)}>{app.currency}</Button>
                  </div>
                  <Field label={`${w('taxRate')} %`}>
                    <input type="number" min="0" max="100" step="any" className={inputClass} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                  </Field>
                </div>
              </>
            )}

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600"><span>{w('subtotal')}</span><span className="tabular-nums">{formatMoney(totals.subtotal, app.currency, app.language)}</span></div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-slate-600"><span>{w('discount')}</span><span className="tabular-nums">− {formatMoney(totals.discount, app.currency, app.language)}</span></div>
              )}
              {totals.tax > 0 && (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>{w('cgst')} @ {Math.round(totals.taxRate / 2)}%</span>
                    <span className="tabular-nums">{formatMoney(totals.cgst, app.currency, app.language)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{w('sgst')} @ {Math.round(totals.taxRate / 2)}%</span>
                    <span className="tabular-nums">{formatMoney(totals.sgst, app.currency, app.language)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-slate-300 pt-2 font-bold text-slate-900">
                <span>{w('grandTotal')}</span>
                <span className="tabular-nums">{formatMoney(totals.total, app.currency, app.language)}</span>
              </div>
            </div>

            {lines.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3 flex items-center gap-3">
                {billingMeta.upi_id ? (
                  <UpiQr value={upiPaymentUrl(billingMeta, totals.total, app.currency, 'Bill')} size={120} />
                ) : (
                  <div className="w-[120px] h-[120px] shrink-0 flex items-center justify-center rounded-md bg-slate-950/5 text-xs text-slate-400">No QR</div>
                )}
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">{w('paymentQr')}</p>
                  <p className="text-slate-500 text-xs mt-1">{w('scanToPay')}</p>
                  {!billingMeta.upi_id && (
                    <p className="text-amber-600 text-xs mt-1">
                      {w('upiId')} not set — add it in {w('settings')} → Shop to enable scanning.
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal open={!!saved} onClose={() => setSaved(null)} title={w('bill')} wide>
        {saved && (
          <div className="space-y-4">
            <div className="bill-print-root">
              <div className="max-h-[62vh] overflow-y-auto">
                <BillDocument bill={saved} language={app.language} />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 print:hidden">
              <Button variant="secondary" onClick={markPaid}>{w('markAsPaid')}</Button>
              <Button variant="secondary" onClick={() => window.print()}>{w('print')}</Button>
              <Button onClick={() => { setSaved(null); setOrderId(null); }}>{w('newBill')}</Button>
            </div>
            <p className="text-xs text-slate-400 print:hidden">{w('printOrEmail')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}