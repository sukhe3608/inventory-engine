'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/app/provider';
import { Card, CardHeader, Button, Badge, Empty } from '@/components/ui';
import { getWord, type WordKey } from '@/lib/i18n';
import { formatNumber, formatDate } from '@/lib/format';
import type { AlertRow } from '@/lib/types';

interface JoinedAlert extends AlertRow {
  variants: { sku: string; name: string | null } | null;
  locations: { name: string } | null;
}

export default function AlertsPage() {
  const app = useApp();
  const w = (k: WordKey) => getWord(app.language, k);
  const canResolve = ['owner', 'manager'].includes(app.role);
  const [open, setOpen] = useState<JoinedAlert[]>([]);
  const [resolved, setResolved] = useState<JoinedAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = app.supabase;
    const tenantId = app.tenantId;
    const [openRes, resolvedRes] = await Promise.all([
      sb.from('low_stock_alerts')
        .select('*, variants(sku, name), locations(name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
        .order('created_at', { ascending: false }) as any,
      sb.from('low_stock_alerts')
        .select('*, variants(sku, name), locations(name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'resolved')
        .order('created_at', { ascending: false })
        .limit(20) as any,
    ]);
    setOpen((openRes.data ?? []) as JoinedAlert[]);
    setResolved((resolvedRes.data ?? []) as JoinedAlert[]);
    setLoading(false);
  }, [app.supabase, app.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(alert: JoinedAlert) {
    const { error } = await app.supabase
      .from('low_stock_alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', alert.id);
    if (error) return;
    load();
  }

  if (loading) return <p className="text-sm text-slate-400">{w('loading')}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{w('alerts')}</h1>

      <Card>
        <CardHeader title={w('openAlertCount')} subtitle={`${open.length} open · ${resolved.length} recently resolved`} />
        {open.length === 0 ? (
          <Empty message="No open alerts" />
        ) : (
          <div className="divide-y divide-slate-100">
            {open.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {a.variants?.name ?? a.sku}
                    <span className="text-slate-400 text-xs ml-2">@ {a.locations?.name}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatNumber(Number(a.quantity), app.language)} on hand · threshold {formatNumber(Number(a.threshold), app.language)} · {formatDate(a.created_at, app.language)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="amber">{a.variants?.sku}</Badge>
                  {canResolve && <Button variant="secondary" onClick={() => resolve(a)}>{w('resolve')}</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {resolved.length > 0 && (
        <Card>
          <CardHeader title="Recently resolved" />
          <div className="divide-y divide-slate-100">
            {resolved.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-4">
                <p className="text-sm text-slate-600">{a.variants?.name ?? a.sku}</p>
                <span className="text-xs text-slate-400">{formatDate(a.created_at, app.language)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}