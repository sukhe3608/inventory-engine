'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '../admin-shell';
import { Card, CardHeader, Badge, Button, Empty } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import type { TenantRow, OrderRow } from '@/lib/types';

const DAYS = 14;

function lastNDays(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push({ key: d.toISOString().slice(0, 10), label: `${d.getDate()}/${d.getMonth() + 1}` });
  }
  return out;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  paid: '#0ea5e9',
  fulfilled: '#10b981',
  cancelled: '#f43f5e',
};

export default function AdminDashboardPage() {
  const { supabase } = useAdmin();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [lowStockByTenant, setLowStockByTenant] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenRes, ordRes, memRes, stkRes] = await Promise.all([
        supabase.from('tenants').select('id, name, slug, status, currency, created_at, phone, city, gstin').order('created_at', { ascending: false }),
        supabase.from('orders').select('id, order_number, tenant_id, status, total, currency, created_at').limit(2000) as any,
        supabase.from('tenant_members').select('tenant_id').limit(5000) as any,
        supabase.from('stock_levels').select('tenant_id, quantity_on_hand, low_stock_threshold').limit(5000) as any,
      ]);
      setTenants((tenRes.data ?? []) as TenantRow[]);
      setOrders((ordRes.data ?? []) as OrderRow[]);
      const memMap: Record<string, number> = {};
      for (const m of (memRes.data ?? []) as { tenant_id: string }[]) {
        memMap[m.tenant_id] = (memMap[m.tenant_id] ?? 0) + 1;
      }
      setMemberCounts(memMap);
      const lowMap: Record<string, number> = {};
      for (const s of (stkRes.data ?? []) as { tenant_id: string; quantity_on_hand: number | null; low_stock_threshold: number | null }[]) {
        const qoh = Number(s.quantity_on_hand ?? 0);
        const thresh = Number(s.low_stock_threshold ?? 0);
        if (thresh > 0 && qoh <= thresh) lowMap[s.tenant_id] = (lowMap[s.tenant_id] ?? 0) + 1;
      }
      setLowStockByTenant(lowMap);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const kpis = useMemo(() => {
    const active = tenants.filter((t) => t.status === 'active').length;
    const suspended = tenants.filter((t) => t.status !== 'active').length;
    const revenueOrders = orders.filter((o) => o.status !== 'cancelled');
    const revenue = revenueOrders.reduce((acc, o) => acc + Number(o.total), 0);
    const revenueInr = revenueOrders.filter((o) => (o.currency ?? 'INR') === 'INR').reduce((acc, o) => acc + Number(o.total), 0);
    const pending = orders.filter((o) => o.status === 'pending').length;
    const lowStock = Object.values(lowStockByTenant).reduce((a, b) => a + b, 0);
    const members = Object.values(memberCounts).reduce((a, b) => a + b, 0);
    return { active, suspended, revenue, revenueInr, pending, lowStock, members };
  }, [tenants, orders, lowStockByTenant, memberCounts]);

  const revenueTrend = useMemo(() => {
    const days = lastNDays(DAYS);
    const byDay: Record<string, number> = {};
    for (const d of days) byDay[d.key] = 0;
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const key = o.created_at.slice(0, 10);
      if (key in byDay) byDay[key] += Number(o.total);
    }
    const max = Math.max(...Object.values(byDay), 1);
    return { days, values: days.map((d) => byDay[d.key]), max };
  }, [orders]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = { pending: 0, paid: 0, fulfilled: 0, cancelled: 0 };
    for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;
    const total = orders.length || 1;
    let cumulative = 0;
    const stops = Object.entries(counts).map(([status, n]) => {
      const start = (cumulative / total) * 360;
      cumulative += n;
      const end = (cumulative / total) * 360;
      return `${STATUS_COLORS[status] ?? '#94a3b8'} ${start}deg ${end}deg`;
    });
    const gradient = stops.length ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(#e2e8f0 0deg 360deg)';
    return { counts, total: orders.length, gradient };
  }, [orders]);

  const topTenants = useMemo(() => {
    const byTenant: Record<string, number> = {};
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      byTenant[o.tenant_id] = (byTenant[o.tenant_id] ?? 0) + Number(o.total);
    }
    const max = Math.max(...Object.values(byTenant), 1);
    return tenants
      .map((t) => ({ tenant: t, revenue: byTenant[t.id] ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [tenants, orders]);

  const tenantRows = useMemo(() =>
    tenants.map((t) => ({
      tenant: t,
      revenue: orders.filter((o) => o.tenant_id === t.id && o.status !== 'cancelled').reduce((a, o) => a + Number(o.total), 0),
      orders: orders.filter((o) => o.tenant_id === t.id).length,
      lowStock: lowStockByTenant[t.id] ?? 0,
      members: memberCounts[t.id] ?? 0,
    })),
  [tenants, orders, lowStockByTenant, memberCounts]);

  const revenueCurrency = (orders[0]?.currency ?? 'INR');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Platform overview</h1>
          <p className="text-sm text-slate-500 mt-1">Revenue, orders and tenant health across all shops.</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-400">Updated {formatDate(new Date().toISOString())}</p>
          <Button variant="secondary" disabled={loading} onClick={() => setRefreshKey((k) => k + 1)}>Refresh</Button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {loading && tenants.length === 0 ? (
        <Card><Empty message="Loading platform data…" /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tenants</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{tenants.length}</p>
              <p className="text-xs text-slate-400 mt-1">
                <span className="text-emerald-600">{kpis.active} active</span> · <span className="text-rose-600">{kpis.suspended} suspended</span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Revenue</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{formatMoney(kpis.revenueInr, 'INR')}</p>
              <p className="text-xs text-slate-400 mt-1">across {revenueOrdersCount(orders, 'INR')} paid orders</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pending orders</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{kpis.pending}</p>
              <p className="text-xs text-slate-400 mt-1">awaiting action</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Health</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{kpis.lowStock}</p>
              <p className="text-xs text-slate-400 mt-1">low-stock lines · {kpis.members} members</p>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 p-4">
              <CardHeader title="Revenue — last 14 days" subtitle={`Total non-cancelled sales per day (${revenueCurrency})`} />
              <div className="h-56 mt-4">
                <div className="flex items-end gap-1 h-44">
                  {revenueTrend.values.map((v, i) => (
                    <div key={revenueTrend.days[i].key} className="flex-1 flex flex-col items-center justify-end h-full group" title={`${revenueTrend.days[i].label}: ${formatMoney(v, revenueCurrency)}`}>
                      <div
                        className="w-full max-w-[28px] rounded-t-md bg-gradient-to-t from-slate-900 to-emerald-500 transition-all group-hover:opacity-80"
                        style={{ height: `${Math.max((v / revenueTrend.max) * 100, 2)}%` }}
                      />
                      <span className="text-[9px] text-slate-400 mt-1.5 hidden sm:block">{revenueTrend.days[i].label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-1 border-t border-slate-200 pt-2">
                  {revenueTrend.values.map((v, i) => (
                    <span key={i} className="flex-1 text-center text-[9px] text-slate-400 sm:hidden">{revenueTrend.days[i].label}</span>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <CardHeader title="Orders by status" />
              <div className="flex items-center gap-5 mt-4">
                <div
                  className="relative h-36 w-36 rounded-full shrink-0"
                  style={{ background: statusBreakdown.gradient }}
                >
                  <div className="absolute inset-4 rounded-full bg-white grid place-items-center">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900">{statusBreakdown.total}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">orders</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {Object.entries(statusBreakdown.counts).map(([status, n]) => (
                    <div key={status} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-2 capitalize">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                        <span className="text-slate-600">{status}</span>
                      </span>
                      <span className="font-semibold text-slate-900 tabular-nums">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-4">
              <CardHeader title="Top tenants by revenue" />
              <div className="space-y-3 mt-3">
                {topTenants.map(({ tenant, revenue }, i) => (
                  <div key={tenant.id} className="flex items-center gap-3">
                    <span className="w-5 text-xs text-slate-400 font-medium">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{tenant.name}</p>
                        <p className="text-xs text-slate-500 tabular-nums">{formatMoney(revenue, tenant.currency)}</p>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-slate-900"
                          style={{ width: `${Math.max((revenue / (topTenants[0]?.revenue || 1)) * 100, 2)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {topTenants.length === 0 && <Empty message="No sales yet" />}
              </div>
            </Card>

            <Card className="p-4">
              <CardHeader title="Tenant health" subtitle="Click a tenant to open the support console" />
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                      <th className="py-2 pr-3">Tenant</th>
                      <th className="py-2 pr-3 text-right">Orders</th>
                      <th className="py-2 pr-3 text-right">Revenue</th>
                      <th className="py-2 pr-3 text-center">Low stock</th>
                      <th className="py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantRows.slice(0, 8).map(({ tenant, revenue, orders: oc, lowStock, members }) => (
                      <tr key={tenant.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-3">
                          <Link href="/admin/support" className="font-medium text-slate-900 hover:text-emerald-700 transition-colors">
                            {tenant.name}
                          </Link>
                          <p className="text-xs text-slate-400">{tenant.slug}{tenant.city ? ` · ${tenant.city}` : ''} · {members} members</p>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{oc}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{formatMoney(revenue, tenant.currency)}</td>
                        <td className="py-2.5 pr-3 text-center">
                          {lowStock > 0 ? <Badge tone="amber">{lowStock}</Badge> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge tone={tenant.status === 'active' ? 'green' : 'rose'}>{tenant.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tenantRows.length === 0 && <Empty message="No tenants yet" />}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function revenueOrdersCount(orders: OrderRow[], currency: string): number {
  return orders.filter((o) => o.status !== 'cancelled' && (o.currency ?? 'INR') === currency).length;
}