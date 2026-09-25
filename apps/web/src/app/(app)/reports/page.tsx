'use client';

import { useApp } from '@/components/app/provider';
import { Card } from '@/components/ui';
import { getWord, type WordKey } from '@/lib/i18n';

export default function ReportsPage() {
  const app = useApp();
  const w = (k: WordKey) => getWord(app.language, k);

  const reports = [
    { type: 'stock-value', title: 'Stock value', desc: 'On-hand quantity × cost per variant and location' },
    { type: 'movements', title: 'Recent movement', desc: 'Every ledger movement with actor, reference and notes' },
    { type: 'low-stock', title: 'Low stock', desc: 'Variants at or under their alert threshold' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{w('reports')}</h1>
      <div className="grid gap-4 md:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.type} className="p-5 flex flex-col justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{r.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{r.desc}</p>
            </div>
            <a
              href={`/reports/${r.type}`}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-50 shadow-sm hover:bg-slate-800 transition-colors"
            >
              {w('downloadCsv')}
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}