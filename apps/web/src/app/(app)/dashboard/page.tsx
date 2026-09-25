'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/components/app/provider';
import { Card, CardHeader, Badge, Empty } from '@/components/ui';
import { getWord, type WordKey } from '@/lib/i18n';
import { formatMoney, formatNumber, formatDate } from '@/lib/format';
import type { StockTransactionRow, OrderRow, AlertRow, StockLevelRow, VariantRow } from '@/lib/types';

export default function DashboardPage() {
  const app = useApp();
  const w = (k: WordKey) => getWord(app.language, k);
  const [loading, setLoading] = useState(true);
  const [skuCount, setSkuCount] = useState(0);
  const [totalOnHand, setTotalOnHand] = useState(0);
  const [stockValue, setStockValue] = useState(0);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [movements, setMovements] = useState<StockTransactionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = app.supabase;
      const tenantId = app.tenantId;

      const [variants, stocks, txns, ordersRes, alertsRes] = await Promise.all([
        sb.from('variants').select('id, cost').eq('tenant_id', tenantId),
        sb.from('stock_levels').select('quantity_on_hand, quantity_available').eq('tenant_id', tenantId),
        sb.from('stock_transactions')
          .select('*, variants(sku, name), locations(name)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(10) as any,
        sb.from('orders')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(5) as any,
        sb.from('low_stock_alerts')
          .select('id').eq('tenant_id', tenantId).eq('status', 'open'),
      ]);

      if (!alive) return;
      const variantsData = (variants.data ?? []) as VariantRow[];
      const stocksData = (stocks.data ?? []) as StockLevelRow[];

      setSkuCount(variantsData.length);
      setTotalOnHand(stocksData.reduce((s, r) => s + Number(r.quantity_on_hand), 0));
      setStockValue(
        stocksData.reduce((s, r) => {
          const v = variantsData.find((x) => x.id === r.variant_id);
          return s + Number(r.quantity_on_hand) * Number(v?.cost ?? 0);
        }, 0),
      );
      setOpenAlerts(alertsRes.data?.length ?? 0);
      setOrderCount(ordersRes.count ?? ordersRes.data?.length ?? 0);
      setMovements((txns.data ?? []) as StockTransactionRow[]);
      setOrders((ordersRes.data ?? []) as OrderRow[]);
      setAlerts((alertsRes.data?.map((a: any) => ({ id: a.id })) ?? []) as AlertRow[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [app.supabase, app.tenantId, app.language]);

  if (loading) {
    return <p className="text-sm text-slate-400">{w('loading')}</p>;
  }

  const stats = [
    { label: w('totalSkus'), value: formatNumber(skuCount, app.language) },
    { label: w('stockOnHand'), value: formatNumber(totalOnHand, app.language) },
    { label: w('stockValue'), value: formatMoney(stockValue, app.currency, app.language) },
    { label: w('openAlertCount'), value: formatNumber(openAlerts, app.language) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{w('dashboard')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {app.tenantName} · {app.currency}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="panel-dark p-5">
            <p className="text-sm font-medium text-slate-400">{s.label}</p>
            <p className="text-2xl font-bold text-slate-50 mt-2 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title={w('recentMovements')} />
          <div className="p-5">
            {movements.length === 0 ? (
              <Empty message="No movements yet" />
            ) : (
              <ul className="space-y-2">
                {movements.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-slate-900 font-medium">{(m as any).variants?.name ?? m.sku}</span>
                      <span className="text-slate-400 ml-2 text-xs">{m.transaction_type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500 text-xs">{formatDate(m.created_at, app.language)}</span>
                      <span className={`font-medium ${Number(m.change_qty) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {Number(m.change_qty) >= 0 ? '+' : ''}{m.change_qty}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={w('newOrders')} actions={<Link href="/orders" className="text-sm font-medium text-slate-900">View</Link>} />
          <div className="p-5">
            {orders.length === 0 ? (
              <Empty message="No orders yet" />
            ) : (
              <ul className="space-y-2">
                {orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-slate-900 font-medium">{o.order_number}</span>
                      <span className="text-slate-400 ml-2 text-xs">{o.customer_name ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={o.status === 'fulfilled' ? 'green' : o.status === 'cancelled' ? 'rose' : o.status === 'paid' ? 'blue' : 'slate'}>
                        {o.status}
                      </Badge>
                      <span className="text-slate-600">{formatMoney(Number(o.total), o.currency, app.language)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}