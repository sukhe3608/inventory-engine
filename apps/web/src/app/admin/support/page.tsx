'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../admin-shell';
import { Card, CardHeader, Badge, Button, Field, inputClass, Empty } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import type { TenantRow, AuditRow, OutboxRow, MemberRow, VariantRow, LocationRow, OrderRow, OrderItemRow } from '@/lib/types';
import { sendInviteEmail } from '@/lib/invites';

type Tab = 'overview' | 'members' | 'data' | 'settings' | 'logs';

interface StockRow {
  variant_id: string;
  location_id: string | null;
  quantity_on_hand: number | null;
  sku?: string;
  variant_name?: string;
}

export default function AdminPage() {
  const { supabase, user } = useAdmin();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [selected, setSelected] = useState<TenantRow | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [orders, setOrders] = useState<(OrderRow & { order_items?: OrderItemRow[] })[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTenants = useCallback(async () => {
    const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
    setTenants((data ?? []) as TenantRow[]);
  }, [supabase]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const filteredTenants = useMemo(() => {
    const q = tenantSearch.toLowerCase().trim();
    if (!q) return tenants;
    return tenants.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      t.currency.toLowerCase().includes(q) ||
      (t.phone ?? '').includes(q) ||
      (t.gstin ?? '').toLowerCase().includes(q) ||
      (t.city ?? '').toLowerCase().includes(q)
    );
  }, [tenants, tenantSearch]);

  const drill = useCallback(async (t: TenantRow | null) => {
    setSelected(t);
    setTab('overview');
    setExpandedOrder(null);
    setNotice(null);
    setError(null);
    if (!t) return;
    const [auditRes, outboxRes] = await Promise.all([
      supabase.from('audit_logs').select('*').eq('tenant_id', t.id).order('created_at', { ascending: false }).limit(50) as any,
      supabase.from('outbox_events').select('*').eq('tenant_id', t.id).order('created_at', { ascending: false }).limit(30) as any,
    ]);
    setAudit((auditRes.data ?? []) as AuditRow[]);
    setOutbox((outboxRes.data ?? []) as OutboxRow[]);
  }, [supabase]);

  const loadTenantData = useCallback(async (t: TenantRow) => {
    const [memRes, varRes, locRes, stkRes, ordRes] = await Promise.all([
      supabase.from('tenant_members').select('*').eq('tenant_id', t.id).order('created_at'),
      supabase.from('variants').select('*').eq('tenant_id', t.id).order('sku'),
      supabase.from('locations').select('*').eq('tenant_id', t.id).order('name'),
      supabase.from('stock_levels').select('*, variants!inner(sku, name)').eq('tenant_id', t.id) as any,
      supabase.from('orders').select('*, order_items(*)').eq('tenant_id', t.id).order('created_at', { ascending: false }).limit(30) as any,
    ]);
    const ms = (memRes.data ?? []) as MemberRow[];
    if (ms.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, email, display_name')
        .in('user_id', ms.map((m) => m.user_id));
      const pmap: Record<string, { email?: string; display_name?: string | null }> = {};
      for (const p of (profiles ?? []) as any[]) pmap[p.user_id] = p;
      setMembers(
        ms.map((m) => ({
          ...m,
          email: pmap[m.user_id]?.email,
          display_name: pmap[m.user_id]?.display_name ?? m.display_name ?? undefined,
        })),
      );
    } else {
      setMembers(ms);
    }
    setVariants((varRes.data ?? []) as VariantRow[]);
    setLocations((locRes.data ?? []) as LocationRow[]);
    const rawStock = (stkRes.data ?? []) as Array<{
      variant_id: string; location_id: string | null; quantity_on_hand: number | null;
      variants?: { sku?: string | null; name?: string | null };
    }>;
    setStock(
      rawStock.map((s) => ({
        variant_id: s.variant_id,
        location_id: s.location_id,
        quantity_on_hand: s.quantity_on_hand,
        sku: s.variants?.sku ?? undefined,
        variant_name: s.variants?.name ?? undefined,
      })),
    );
    setOrders((ordRes.data ?? []) as (OrderRow & { order_items?: OrderItemRow[] })[]);
  }, [supabase]);

  useEffect(() => {
    if (!selected) return;
    loadTenantData(selected);
  }, [selected, loadTenantData]);

  async function setTenantStatus(t: TenantRow, status: 'active' | 'suspended') {
    const { error: e } = await supabase
      .from('tenants')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', t.id);
    if (e) return setError(e.message);
    setNotice(`Tenant ${status === 'active' ? 'activated' : 'suspended'}`);
    loadTenants();
    setSelected({ ...t, status });
  }

  async function changeRole(member: MemberRow, role: string) {
    const { error: e } = await supabase
      .from('tenant_members')
      .update({ role })
      .eq('tenant_id', member.tenant_id)
      .eq('user_id', member.user_id);
    if (e) return setError(e.message);
    setMembers((ms) =>
      ms.map((m) => (m.user_id === member.user_id ? { ...m, role: role as MemberRow['role'] } : m)),
    );
    setNotice(`Role updated to ${role}`);
  }

  async function removeMember(member: MemberRow) {
    const { error: e } = await supabase
      .from('tenant_members')
      .delete()
      .eq('tenant_id', member.tenant_id)
      .eq('user_id', member.user_id);
    if (e) return setError(e.message);
    setMembers((ms) => ms.filter((m) => m.user_id !== member.user_id));
    setNotice('Member removed');
  }

  async function resetPassword(member: MemberRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.user_id, email: member.email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Reset failed');
      setNotice(`Password reset → ${member.email} | Temp: ${json.tempPassword}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function inviteMember() {
    const email = (document.getElementById('admin-invite-email') as HTMLInputElement | null)?.value.trim();
    if (!email) return setError('Enter an email');
    const { data, error: e } = await supabase
      .from('invitations')
      .insert({ tenant_id: selected!.id, email, role: 'manager', token: crypto.randomUUID(), created_by: user.id })
      .select('id')
      .single();
    if (e) return setError(e.message);
    const res = await sendInviteEmail(data!.id);
    setNotice(
      res.ok
        ? `Invite sent to ${email}`
        : res.message === 'EMAIL_NOT_CONFIGURED'
          ? `Email not configured — share link: ${res.acceptLink}`
          : `Invite created: ${res.message}`,
    );
    if (selected) loadTenantData(selected);
  }

  async function fixStock(row: StockRow, change: number) {
    if (!row.location_id) return setError('No location for this stock row');
    const { error: e } = await supabase.rpc('apply_stock_change', {
      p_location_id: row.location_id,
      p_variant_id: row.variant_id,
      p_change_qty: change,
      p_transaction_type: 'adjustment',
      p_notes: 'Platform admin adjustment',
      p_actor_user_id: user.id,
      p_actor_name: 'platform_admin',
      p_tenant_id: selected!.id,
    });
    if (e) return setError(e.message);
    if (selected) loadTenantData(selected);
    setNotice('Stock adjusted');
  }

  async function fixOrderStatus(order: OrderRow, status: string) {
    const { error: e } = await supabase.rpc('update_order_status', {
      p_order_id: order.id,
      p_status: status,
      p_actor_user_id: user.id,
      p_actor_name: 'platform_admin',
    });
    if (e) return setError(e.message);
    if (selected) loadTenantData(selected);
    setNotice(`Order ${order.order_number} → ${status}`);
  }

  const [billing, setBilling] = useState<Record<string, string>>({});
  useEffect(() => {
    if (selected) {
      setBilling({
        gstin: selected.gstin ?? '',
        state_code: selected.state_code ?? '',
        upi_id: selected.upi_id ?? '',
        phone: selected.phone ?? '',
        address_line1: selected.address_line1 ?? '',
        address_line2: selected.address_line2 ?? '',
        city: selected.city ?? '',
        postal_code: selected.postal_code ?? '',
        invoice_prefix: selected.invoice_prefix ?? 'INV',
        tax_rate: String(selected.tax_rate ?? 0),
        enable_tax: selected.enable_tax ? 'true' : 'false',
      });
    }
  }, [selected]);

  async function saveSettings() {
    const { error: e } = await supabase
      .from('tenants')
      .update({
        gstin: billing.gstin || null,
        state_code: billing.state_code || null,
        upi_id: billing.upi_id || null,
        phone: billing.phone || null,
        address_line1: billing.address_line1 || null,
        address_line2: billing.address_line2 || null,
        city: billing.city || null,
        postal_code: billing.postal_code || null,
        invoice_prefix: billing.invoice_prefix || 'INV',
        tax_rate: Number(billing.tax_rate) || 0,
        enable_tax: billing.enable_tax === 'true',
        updated_at: new Date().toISOString(),
      })
      .eq('id', selected!.id);
    if (e) return setError(e.message);
    setNotice('Shop settings saved');
    loadTenants();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'members', label: 'Members' },
    { id: 'data', label: 'Data fixes' },
    { id: 'settings', label: 'Shop settings' },
    { id: 'logs', label: 'Audit & outbox' },
  ];

  const groupedStock = useMemo(() => {
    const out = new Map<string, { sku: string; name: string; rows: StockRow[] }>();
    for (const s of stock) {
      const key = s.variant_id;
      if (!out.has(key)) out.set(key, { sku: s.sku ?? '', name: s.variant_name ?? '', rows: [] });
      out.get(key)!.rows.push(s);
    }
    return [...out.values()];
  }, [stock]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tenant support console</h1>
          <p className="text-sm text-slate-500 mt-1">Manage tenants, fix data, adjust billing — every change is audited.</p>
        </div>
        {selected && (
          <Button variant="secondary" onClick={() => setSelected(null)}>← All tenants</Button>
        )}
      </div>
      {notice && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{notice}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {!selected ? (
        <Card>
          <CardHeader
            title="Tenants"
            subtitle={`${tenants.length} tenants`}
            actions={
              <input
                className={inputClass + ' !w-56 text-sm'}
                placeholder="Search tenants..."
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
              />
            }
          />
          <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
            {filteredTenants.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 truncate">{t.name}</p>
                    <Badge tone={t.status === 'active' ? 'green' : 'rose'}>{t.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {t.slug} · {t.currency}{t.phone ? ` · ${t.phone}` : ''}{t.city ? ` · ${t.city}` : ''} · created {formatDate(t.created_at)}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => drill(t)}>Open</Button>
              </div>
            ))}
            {filteredTenants.length === 0 && <Empty message="No tenants match your search" />}
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{selected.name}</p>
                  <p className="text-xs text-slate-400">{selected.slug} · {selected.currency} · {formatDate(selected.created_at)}</p>
                </div>
                <Badge tone={selected.status === 'active' ? 'green' : 'rose'}>{selected.status}</Badge>
                {selected.phone && <p className="text-xs text-slate-500">{selected.phone}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setTenantStatus(selected, selected.status === 'active' ? 'suspended' : 'active')}>
                  {selected.status === 'active' ? 'Suspend tenant' : 'Activate tenant'}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-4">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-slate-900 text-slate-50' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Card>

          {tab === 'overview' && (
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="p-4">
                <CardHeader title="Team contacts" subtitle="Members & roles for this tenant" actions={
                  <Button size="sm" variant="secondary" onClick={() => setTab('members')}>Manage team</Button>
                } />
                <div className="space-y-1.5">
                  {members.map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{m.email ?? m.user_id}</p>
                        <p className="text-xs text-slate-400">{m.display_name ?? ''} · {m.role}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => resetPassword(m)} disabled={busy}>Reset password</Button>
                    </div>
                  ))}
                  {members.length === 0 && <p className="text-sm text-slate-400 py-2">No members found.</p>}
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title="Quick stats" />
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3"><p className="text-2xl font-bold text-slate-900">{variants.length}</p><p className="text-xs text-slate-500">Variants</p></div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3"><p className="text-2xl font-bold text-slate-900">{orders.length}</p><p className="text-xs text-slate-500">Recent orders</p></div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3"><p className="text-2xl font-bold text-slate-900">{members.length}</p><p className="text-xs text-slate-500">Members</p></div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3"><p className="text-2xl font-bold text-slate-900">{selected.enable_tax ? `${selected.tax_rate}%` : '—'}</p><p className="text-xs text-slate-500">GST</p></div>
                </div>
                <p className="text-xs text-slate-400 mt-4">Every data change made from this console is recorded in the tenant&apos;s audit trail and visible to them.</p>
              </Card>
              <Card className="p-4">
                <CardHeader title="Shop identity" />
                <div className="space-y-1.5 text-sm">
                  <p><span className="text-slate-500">UPI:</span> <span className="font-medium">{selected.upi_id || '—'}</span></p>
                  <p><span className="text-slate-500">GSTIN:</span> <span className="font-medium">{selected.gstin || '—'}</span></p>
                  <p><span className="text-slate-500">Phone:</span> <span className="font-medium">{selected.phone || '—'}</span></p>
                  <p><span className="text-slate-500">Invoice prefix:</span> <span className="font-medium">{selected.invoice_prefix}</span></p>
                  <p><span className="text-slate-500">Default location:</span> <span className="font-medium">{selected.default_location_id?.slice(0, 8) || '—'}</span></p>
                </div>
              </Card>
            </div>
          )}

          {tab === 'members' && (
            <Card className="p-4 space-y-4">
              <CardHeader title="Team" subtitle="Reset passwords server-side, change roles, or invite new members. All actions are audited." />
              <div className="flex items-end gap-3 max-w-md">
                <div className="flex-1">
                  <Field label="Invite by email">
                    <input id="admin-invite-email" className={inputClass} type="email" placeholder="teammate@example.com" />
                  </Field>
                </div>
                <Button onClick={inviteMember}>Send invite</Button>
              </div>
              <div className="divide-y divide-slate-100">
                {members.map((m) => (
                  <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{m.email ?? m.user_id}</p>
                      <p className="text-xs text-slate-400">{m.display_name ?? ''}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className={inputClass + ' !w-auto !py-1.5 text-sm'}
                        value={m.role}
                        onChange={(e) => changeRole(m, e.target.value)}
                      >
                        {['owner', 'manager', 'staff', 'read_only'].map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => resetPassword(m)}>Reset password</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeMember(m)}>Remove</Button>
                    </div>
                  </div>
                ))}
                {members.length === 0 && <Empty message="No members" />}
              </div>
            </Card>
          )}

          {tab === 'data' && (
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="p-4">
                <CardHeader title="Stock" subtitle="Add or remove quantity on hand (audited via apply_stock_change)" />
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {groupedStock.map((g) => (
                    <div key={g.sku} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-medium text-slate-900">{g.name || g.sku}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {g.rows.map((r) => (
                          <div key={r.location_id ?? 'none'} className="flex items-center gap-2 rounded-md bg-slate-50 border border-slate-200 px-2 py-1 text-sm">
                            <span className="text-slate-500 text-xs">{r.location_id?.slice(0, 8) || 'noloc'}</span>
                            <span className="tabular-nums font-medium">{r.quantity_on_hand ?? 0}</span>
                            <button className="text-slate-400 hover:text-rose-600 px-1" onClick={() => fixStock(r, -1)}>−1</button>
                            <button className="text-slate-400 hover:text-emerald-600 px-1" onClick={() => fixStock(r, 1)}>+1</button>
                            <button className="text-slate-400 hover:text-emerald-600 px-1" onClick={() => fixStock(r, 10)}>+10</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {groupedStock.length === 0 && <Empty message="No stock levels" />}
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title="Orders" subtitle="Fix order status — cancellations restore stock automatically" />
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {orders.map((o) => (
                    <div key={o.id} className="rounded-lg border border-slate-200">
                      <button
                        className="w-full text-left flex items-center justify-between gap-2 p-3 hover:bg-slate-50 transition-colors rounded-lg"
                        onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">{o.order_number}</p>
                            <Badge tone={o.status === 'paid' ? 'blue' : o.status === 'cancelled' ? 'rose' : o.status === 'fulfilled' ? 'green' : 'slate'}>{o.status}</Badge>
                          </div>
                          <p className="text-xs text-slate-400">
                            {formatMoney(Number(o.total), o.currency)} · {o.customer_name || 'walk-in'} · {formatDate(o.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {['paid', 'fulfilled', 'cancelled'].map((s) =>
                            o.status !== s ? (
                              <span
                                key={s}
                                role="button"
                                className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); fixOrderStatus(o, s); }}
                              >
                                {s}
                              </span>
                            ) : null,
                          )}
                          <span className="text-slate-400 text-xs">{expandedOrder === o.id ? '▾' : '▸'}</span>
                        </div>
                      </button>
                      {expandedOrder === o.id && o.order_items && o.order_items.length > 0 && (
                        <div className="border-t border-slate-200 px-3 pb-3 pt-2 space-y-1">
                          {o.order_items.map((it) => (
                            <div key={it.id} className="flex items-center justify-between text-xs text-slate-600 gap-2">
                              <span className="truncate">{it.variant_name ?? it.sku ?? it.variant_id}</span>
                              <span className="tabular-nums shrink-0">{it.quantity} × {formatMoney(Number(it.unit_price), o.currency)}</span>
                            </div>
                          ))}
                          {o.discount_amount > 0 && (
                            <p className="text-xs text-rose-600 pt-1">Discount: −{formatMoney(Number(o.discount_amount), o.currency)}</p>
                          )}
                          {o.tax_amount > 0 && (
                            <p className="text-xs text-slate-500">Tax ({o.tax_rate}%): +{formatMoney(Number(o.tax_amount), o.currency)}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {orders.length === 0 && <Empty message="No orders" />}
                </div>
              </Card>
            </div>
          )}

          {tab === 'settings' && (
            <Card className="p-4">
              <CardHeader title="Shop settings" subtitle="Edit tenant billing & configuration on their behalf" />
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="GSTIN"><input className={inputClass} value={billing.gstin ?? ''} onChange={(e) => setBilling({ ...billing, gstin: e.target.value })} /></Field>
                <Field label="State code"><input className={inputClass} value={billing.state_code ?? ''} onChange={(e) => setBilling({ ...billing, state_code: e.target.value })} /></Field>
                <Field label="UPI ID"><input className={inputClass} value={billing.upi_id ?? ''} onChange={(e) => setBilling({ ...billing, upi_id: e.target.value })} /></Field>
                <Field label="Phone"><input className={inputClass} value={billing.phone ?? ''} onChange={(e) => setBilling({ ...billing, phone: e.target.value })} /></Field>
                <Field label="Address line 1"><input className={inputClass} value={billing.address_line1 ?? ''} onChange={(e) => setBilling({ ...billing, address_line1: e.target.value })} /></Field>
                <Field label="Address line 2"><input className={inputClass} value={billing.address_line2 ?? ''} onChange={(e) => setBilling({ ...billing, address_line2: e.target.value })} /></Field>
                <Field label="City"><input className={inputClass} value={billing.city ?? ''} onChange={(e) => setBilling({ ...billing, city: e.target.value })} /></Field>
                <Field label="Postal code"><input className={inputClass} value={billing.postal_code ?? ''} onChange={(e) => setBilling({ ...billing, postal_code: e.target.value })} /></Field>
                <Field label="Invoice prefix"><input className={inputClass} value={billing.invoice_prefix ?? ''} onChange={(e) => setBilling({ ...billing, invoice_prefix: e.target.value })} /></Field>
                <Field label="Tax rate %"><input type="number" min="0" max="100" className={inputClass} value={billing.tax_rate ?? ''} onChange={(e) => setBilling({ ...billing, tax_rate: e.target.value })} /></Field>
                <Field label="Enable tax">
                  <select className={inputClass} value={billing.enable_tax ?? 'false'} onChange={(e) => setBilling({ ...billing, enable_tax: e.target.value })}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </Field>
              </div>
              <div className="mt-4 flex justify-end"><Button onClick={saveSettings}>Save settings</Button></div>
            </Card>
          )}

          {tab === 'logs' && (
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader title={`${selected.name} — audit trail`} />
                {audit.length === 0 ? (
                  <Empty message="No entries" />
                ) : (
                  <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                    {audit.map((l) => (
                      <div key={l.id} className="flex items-center justify-between p-3 text-sm">
                        <div>
                          <span className="text-slate-900 font-medium">{l.action}</span>
                          <span className="text-slate-400 text-xs ml-2">{l.entity_type}</span>
                        </div>
                        <span className="text-xs text-slate-400">{formatDate(l.created_at)} · {l.actor_role ?? ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <CardHeader title="Outbox" subtitle="Pending, sent and dead-letter sync events" />
                {outbox.length === 0 ? (
                  <Empty message="No outbox events" />
                ) : (
                  <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                    {outbox.map((o) => (
                      <div key={o.id} className="flex items-center justify-between p-3 text-sm">
                        <div>
                          <span className="text-slate-900 font-medium">{o.event_type}</span>
                          <span className="text-slate-400 text-xs ml-2">attempts {o.attempts}</span>
                        </div>
                        <div className="text-right">
                          <Badge tone={o.status === 'sent' ? 'green' : o.status === 'dead' ? 'rose' : 'amber'}>{o.status}</Badge>
                          {o.last_error && <p className="text-xs text-slate-400">{o.last_error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}