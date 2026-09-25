'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/app/provider';
import { Card, CardHeader, Button, Badge, Field, inputClass, Modal, Empty } from '@/components/ui';
import { getWord, type WordKey } from '@/lib/i18n';
import { formatNumber, formatDate } from '@/lib/format';
import type { LocationRow, StockLevelRow, StockTransactionRow } from '@/lib/types';

interface JoinedStock extends StockLevelRow {
  variants: { sku: string; name: string | null } | null;
  locations: { name: string } | null;
}

type ModalKind = 'adjust' | 'threshold' | 'history';

export default function InventoryPage() {
  const app = useApp();
  const w = (k: WordKey) => getWord(app.language, k);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [stock, setStock] = useState<JoinedStock[]>([]);
  const [variants, setVariants] = useState<{ id: string; sku: string; name: string | null }[]>([]);
  const [modal, setModal] = useState<{ kind: ModalKind; row: JoinedStock | null } | null>(null);
  const [history, setHistory] = useState<StockTransactionRow[]>([]);
  const [changeQty, setChangeQty] = useState('');
  const [reason, setReason] = useState('');
  const [threshold, setThreshold] = useState('');
  const [newLocation, setNewLocation] = useState({ name: '', city: '', type: 'store' });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = app.supabase;
    const tenantId = app.tenantId;
    const [locRes, stockRes, variRes] = await Promise.all([
      sb.from('locations').select('*').eq('tenant_id', tenantId).order('name'),
      sb.from('stock_levels')
        .select('*, variants(sku, name), locations(name)')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false }) as any,
      sb.from('variants').select('id, sku, name').eq('tenant_id', tenantId).order('sku'),
    ]);
    setLocations(locRes.data ?? []);
    setStock((stockRes.data ?? []) as JoinedStock[]);
    setVariants((variRes.data ?? []) as { id: string; sku: string; name: string | null }[]);
    setLoading(false);
  }, [app.supabase, app.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addLocation() {
    if (!newLocation.name.trim()) return;
    const { error } = await app.supabase.from('locations').insert({
      tenant_id: app.tenantId,
      name: newLocation.name.trim(),
      city: newLocation.city.trim() || null,
      location_type: newLocation.type,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewLocation({ name: '', city: '', type: 'store' });
    setNotice('Location added');
    load();
  }

  async function submitAdjust() {
    if (!modal?.row) return;
    const qty = Number(changeQty);
    if (!qty) return;
    const { error } = await app.supabase.rpc('apply_stock_change', {
      p_location_id: modal.row.location_id,
      p_variant_id: modal.row.variant_id,
      p_change_qty: qty,
      p_transaction_type: 'adjustment',
      p_notes: reason || null,
      p_idempotency_key: crypto.randomUUID(),
      p_actor_user_id: app.user.id,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setModal(null);
    setReason('');
    setChangeQty('');
    setError(null);
    load();
  }

  async function submitOpening() {
    if (!modal?.row) return;
    const qty = Number(changeQty);
    if (!qty) return;
    const { error } = await app.supabase.rpc('apply_stock_change', {
      p_location_id: modal.row.location_id,
      p_variant_id: modal.row.variant_id,
      p_change_qty: qty,
      p_transaction_type: 'opening_balance',
      p_notes: 'Opening balance',
      p_idempotency_key: crypto.randomUUID(),
      p_actor_user_id: app.user.id,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setModal(null);
    setChangeQty('');
    setError(null);
    load();
  }

  async function submitThreshold() {
    if (!modal?.row) return;
    const value = Number(threshold);
    if (Number.isNaN(value)) return;
    const { error } = await app.supabase.rpc('set_stock_threshold', {
      p_variant_id: modal.row.variant_id,
      p_location_id: modal.row.location_id,
      p_threshold: value,
      p_tenant_id: app.tenantId,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setModal(null);
    setThreshold('');
    setError(null);
    load();
  }

  async function openHistory(row: JoinedStock) {
    const { data } = await app.supabase
      .from('stock_transactions')
      .select('*, variants(sku, name), locations(name)')
      .eq('tenant_id', app.tenantId)
      .eq('variant_id', row.variant_id)
      .eq('location_id', row.location_id)
      .order('created_at', { ascending: false })
      .limit(50) as any;
    setHistory((data ?? []) as StockTransactionRow[]);
    setModal({ kind: 'history', row });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{w('inventory')}</h1>
      </div>
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card className="p-5">
        <CardHeader title={w('addLocation')} />
        <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
          <Field label={w('name')}>
            <input className={inputClass} value={newLocation.name} onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })} />
          </Field>
          <Field label="City">
            <input className={inputClass} value={newLocation.city} onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })} />
          </Field>
          <Field label="Type">
            <select className={inputClass} value={newLocation.type} onChange={(e) => setNewLocation({ ...newLocation, type: e.target.value })}>
              <option value="store">Store</option>
              <option value="warehouse">Warehouse</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Button onClick={addLocation}>{w('save')}</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Stock levels" subtitle={locations.map((l) => l.name).join(', ') || 'No locations yet'} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">{w('name')}</th>
                <th className="px-5 py-3">{w('location')}</th>
                <th className="px-5 py-3 text-right">{w('onHandShort')}</th>
                <th className="px-5 py-3 text-right">{w('available')}</th>
                <th className="px-5 py-3 text-right">{w('threshold')}</th>
                <th className="px-5 py-3">{w('status')}</th>
                <th className="px-5 py-3 text-right">{w('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {stock.length === 0 && loading && (
                <tr><td colSpan={8}><Empty message={w('loading')} /></td></tr>
              )}
              {stock.length === 0 && !loading && (
                <tr><td colSpan={8}><Empty message="No stock levels yet — add an opening balance" /></td></tr>
              )}
              {stock.map((row) => {
                const isLow = Number(row.low_stock_threshold) > 0 && Number(row.quantity_available) <= Number(row.low_stock_threshold);
                return (
                  <tr key={row.id} className="table-row">
                    <td className="px-5 py-3 font-mono text-xs">{row.variants?.sku}</td>
                    <td className="px-5 py-3 text-slate-900">{row.variants?.name}</td>
                    <td className="px-5 py-3 text-slate-500">{row.locations?.name}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatNumber(Number(row.quantity_on_hand), app.language)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatNumber(Number(row.quantity_available), app.language)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatNumber(Number(row.low_stock_threshold), app.language)}</td>
                    <td className="px-5 py-3">
                      {Number(row.quantity_available) <= 0 ? (
                        <Badge tone="rose">{w('outOfStock')}</Badge>
                      ) : isLow ? (
                        <Badge tone="amber">{w('lowStock')}</Badge>
                      ) : (
                        <Badge tone="green">{w('inStock')}</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {['owner', 'manager', 'staff'].includes(app.role) && (
                          <>
                            <Button variant="ghost" onClick={() => { setChangeQty(''); setReason(''); setModal({ kind: 'adjust', row }); }}>{w('adjust')}</Button>
                            <Button variant="ghost" onClick={() => { setChangeQty(''); setModal({ kind: 'threshold', row }); }}>{w('setThreshold')}</Button>
                            <Button variant="ghost" onClick={() => { setChangeQty(''); setModal({ kind: 'history', row }); }}>{w('history')}</Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modal?.kind === 'adjust'} onClose={() => setModal(null)} title="Adjust stock">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {modal?.row?.variants?.name} at {modal?.row?.locations?.name} — currently{' '}
            {formatNumber(Number(modal?.row?.quantity_on_hand), app.language)}
          </p>
          <Field label="Change (negative to reduce)">
            <input type="number" step="any" className={inputClass} value={changeQty} onChange={(e) => setChangeQty(e.target.value)} />
          </Field>
          <Field label="Reason">
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModal(null)}>{w('cancel')}</Button>
            <Button onClick={submitAdjust}>{w('save')}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={modal?.kind === 'threshold'} onClose={() => setModal(null)} title="Set low stock threshold">
        <div className="space-y-4">
          <Field label="Threshold (0 disables)">
            <input type="number" step="any" className={inputClass} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </Field>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModal(null)}>{w('cancel')}</Button>
            <Button onClick={submitThreshold}>{w('save')}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={modal?.kind === 'history'} onClose={() => setModal(null)} title={w('history')}>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={load}>{w('updated')}</Button>
          </div>
          {history.length === 0 ? (
            <Empty message="No history" />
          ) : (
            history.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                <div>
                  <span className="text-slate-900">{t.transaction_type}</span>
                  {t.notes && <span className="text-slate-400 ml-1 text-xs">{t.notes}</span>}
                  <p className="text-xs text-slate-400">{formatDate(t.created_at, app.language)} · {t.actor_name ?? '—'}</p>
                </div>
                <div className="text-right">
                  <span className={Number(t.change_qty) >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {Number(t.change_qty) >= 0 ? '+' : ''}{t.change_qty}
                  </span>
                  <p className="text-xs text-slate-400">→ {t.qty_after}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}