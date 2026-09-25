import Link from 'next/link';

const FEATURES = [
  {
    title: 'Ledger-driven stock control',
    desc: 'Every movement is a permanent, tamper-proof stock transaction. No silent overwrites, no reconciliation surprises.',
    icon: 'M3 8h18M3 16h18M6 5v6m12-6v6M6 13v6m12-6v6',
  },
  {
    title: 'Multi-location inventory',
    desc: 'Track stock across stores and warehouses with per-location quantities, on-hand totals, and reorder thresholds.',
    icon: 'M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Zm0-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  },
  {
    title: 'Smart low-stock alerts',
    desc: 'Automatic alerts the moment a variant dips below its threshold, so you restock before you run out — not after.',
    icon: 'M12 3v12m0 0a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Zm0 0m0 6h.01',
  },
  {
    title: 'Orders & fulfilment',
    desc: 'Create orders, reserve quantity atomically, and mark them fulfilled or cancelled — a complete audit trail built in.',
    icon: 'M9 17l-5-5 5-5m6 10l5-5-5-5',
  },
  {
    title: 'Developer-friendly API',
    desc: 'A REST API with scoped keys for your POS, website, or shipping partners. Sync stock near-real-time to anywhere.',
    icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  },
  {
    title: 'Embeddable stock widget',
    desc: 'Drop a script tag on your own website and show live stock badges to shoppers. Keep inventory and storefront in sync.',
    icon: 'M4 6h16v12H4zM4 10h16M9 15h2',
  },
  {
    title: 'Roles & permissions',
    desc: 'Owners, managers, and staff with fine-grained access. Row-level security keeps every tenant completely isolated.',
    icon: 'M12 15v2m-6 4h12v-7a6 6 0 0 0-12 0v7Zm6-13a4 4 0 0 1 4 4v2h-8V8a4 4 0 0 1 4-4Z',
  },
  {
    title: 'Built for India',
    desc: 'INR pricing, hi-IN + en-IN formatting, India-first hosting in Mumbai, and compliance-minded data residency.',
    icon: 'M3 21h18M6 21V8m6 13V3m6 18v-9',
  },
];

const STEPS = [
  {
    step: '01',
    title: 'Create your shop',
    desc: 'Sign up in under a minute, then run a guided 3-step setup — profile, locations, and your team.',
  },
  {
    step: '02',
    title: 'Add products & stock',
    desc: 'Create categories, products, and variants with SKUs, costs, and prices. Post opening balances to bring stock live.',
  },
  {
    step: '03',
    title: 'Sync anywhere',
    desc: 'Embed the stock widget on your site, issue scoped API keys to your POS, and get low-stock alerts automatically.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="max-w-6xl mx-auto px-6 pt-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-slate-900 ring-1 ring-slate-900/10 flex items-center justify-center text-slate-50 text-sm font-bold tracking-tight">
            IE
          </span>
          <span className="font-bold tracking-tight text-slate-900 text-lg">Inventory Engine</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
          <a href="#how" className="hover:text-slate-900 transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-slate-900 transition-colors">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-50 shadow-sm hover:bg-slate-800 transition-colors"
          >
            Get started
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Multi-tenant inventory engine, free tier friendly
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl md:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
          Inventory that just <span className="text-emerald-700">works</span> for your shop
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base md:text-lg text-slate-500">
          Track stock, orders, and alerts across every location — with a clean dashboard, a
          developer-ready API, and an embeddable storefront widget.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-50 shadow-sm hover:bg-slate-800 transition-colors"
          >
            Get started free
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            View live demo
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-400">No credit card · Set up in under 5 minutes · Hosted in Mumbai</p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="panel-dark p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-slate-400">Acme Fashion · INR</p>
              <p className="text-lg font-bold text-slate-50">Dashboard</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
              <span className="text-xs text-slate-400">Live</span>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total SKUs', value: '26' },
              { label: 'Stock on hand', value: '1,204' },
              { label: 'Stock value', value: '₹6,82,410' },
              { label: 'Open alerts', value: '3', accent: true },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="mt-1.5 text-xl font-bold text-slate-50 tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-900 mb-3">Recent movements</p>
              <div className="space-y-2.5">
                {[
                  { name: 'Stripe Tee / M', type: 'sale', qty: '-2', positive: false },
                  { name: 'Basmati Rice 5kg', type: 'opening_balance', qty: '+40', positive: true },
                  { name: 'Cotton Cap', type: 'adjustment', qty: '-1', positive: false },
                ].map((m) => (
                  <div key={m.name} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">{m.name}</span>
                    <span className="text-slate-400 text-xs">{m.type}</span>
                    <span className={`font-semibold tabular-nums ${m.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {m.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-900 mb-3">Stock by location</p>
              <div className="space-y-3">
                {[
                  { name: 'Main Store', pct: 78 },
                  { name: 'Warehouse', pct: 54 },
                  { name: 'Andheri Outlet', pct: 32 },
                ].map((b) => (
                  <div key={b.name}>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>{b.name}</span>
                      <span>{b.pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-700"
                        style={{ width: `${b.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 pb-20">
        <p className="text-center text-sm font-semibold text-amber-600 uppercase tracking-widest">Features</p>
        <h2 className="mt-3 text-center text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
          Everything a growing shop needs
        </h2>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={f.icon} />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="max-w-6xl mx-auto px-6 pb-20">
        <p className="text-center text-sm font-semibold text-amber-600 uppercase tracking-widest">How it works</p>
        <h2 className="mt-3 text-center text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
          Live in three steps
        </h2>
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div key={s.step} className="card p-6 relative overflow-hidden">
              <span className="text-4xl font-bold text-slate-100 tracking-tight">{s.step}</span>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="max-w-6xl mx-auto px-6 pb-20">
        <div className="panel-dark px-8 py-12 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-50">
            Start free. Upgrade when you grow.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
            Everything you need today at no cost. When you cross ten paying tenants, move to a paid
            plan for faster sync, backups, and priority support.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-sm hover:bg-amber-400 transition-colors"
            >
              Start free today
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition-colors"
            >
              Sign in to your shop
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white/60">
        <div className="max-w-6xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-slate-900 flex items-center justify-center text-slate-50 text-xs font-bold">
                IE
              </span>
              <span className="font-bold tracking-tight text-slate-900">Inventory Engine</span>
            </div>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
              Multi-tenant inventory for small shops. Simple to run, safe to trust, ready to integrate.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-3">Product</p>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><a href="#features" className="hover:text-slate-900 transition-colors">Dashboard</a></li>
              <li><a href="#features" className="hover:text-slate-900 transition-colors">Inventory</a></li>
              <li><a href="#features" className="hover:text-slate-900 transition-colors">Orders</a></li>
              <li><a href="#features" className="hover:text-slate-900 transition-colors">Alerts</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-3">Developers</p>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><span className="cursor-default">REST API</span></li>
              <li><span className="cursor-default">Scoped API keys</span></li>
              <li><span className="cursor-default">Stock widget</span></li>
              <li><span className="cursor-default">Webhooks</span></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-3">Company</p>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><span className="cursor-default">Made in India</span></li>
              <li><span className="cursor-default">Data hosted in Mumbai</span></li>
              <li><span className="cursor-default">en-IN & hi-IN support</span></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200 px-6 py-5 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Inventory Engine. All rights reserved.
        </div>
      </footer>
    </div>
  );
}