'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from './provider';
import { getWord, type WordKey, CURRENCIES } from '@/lib/i18n';

const NAV: { href: string; key: WordKey; managerOnly?: boolean; adminOnly?: boolean; hideForPlatformAdmin?: boolean }[] = [
  { href: '/dashboard', key: 'dashboard', hideForPlatformAdmin: true },
  { href: '/inventory', key: 'inventory', hideForPlatformAdmin: true },
  { href: '/products', key: 'products', hideForPlatformAdmin: true },
  { href: '/orders', key: 'orders', hideForPlatformAdmin: true },
  { href: '/billing', key: 'billing', hideForPlatformAdmin: true },
  { href: '/alerts', key: 'alerts' },
  { href: '/reports', key: 'reports' },
  { href: '/settings', key: 'settings', managerOnly: true },
  { href: '/admin/dashboard', key: 'adminDashboard', adminOnly: true },
  { href: '/admin/support', key: 'adminSupport', adminOnly: true },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const w = (k: WordKey) => getWord(app.language, k);

  if (!app.tenantId) {
    if (pathname === '/onboarding') {
      return <>{children}</>;
    }
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 text-center space-y-4 max-w-sm">
          <p className="text-lg font-semibold text-slate-900">Set up your shop to continue</p>
          <button
            onClick={() => router.push('/onboarding')}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-50 shadow-sm hover:bg-slate-800 transition-colors"
          >
            Start onboarding
          </button>
        </div>
      </div>
    );
  }

  const items = NAV.filter((n) => {
    if (app.isPlatformAdmin && n.hideForPlatformAdmin) return false;
    if (n.adminOnly && !app.isPlatformAdmin) return false;
    if (n.managerOnly && !['owner', 'manager'].includes(app.role)) return false;
    return true;
  });

  async function signOut() {
    await app.supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="bg-slate-950 border-b lg:border-b-0 lg:border-r border-white/10">
        <div className="flex items-center justify-between gap-2 px-4 py-5">
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-slate-900 ring-1 ring-white/20 flex items-center justify-center text-slate-50 text-sm font-bold tracking-tight">
              IE
            </span>
            <div>
              <p className="font-semibold text-slate-50">{app.tenantName}</p>
              <p className="text-xs text-slate-400">{CURRENCIES[app.currency]?.split(' ')[0] ?? app.currency}</p>
            </div>
          </div>
          <span className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
        </div>
        <nav className="lg:px-3 px-4 pb-4 space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="sidebar-link"
              aria-current={
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                    ? 'page'
                    : undefined
                  : pathname.startsWith(item.href)
                    ? 'page'
                    : undefined
              }
            >
              {w(item.key)}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10 lg:mt-6">
          <p className="text-sm font-medium text-slate-200">
            {app.user.user_metadata?.display_name ?? app.user.email}
          </p>
          <button onClick={signOut} className="mt-2 text-sm text-slate-400 hover:text-slate-100 transition-colors">
            {w('signOut')}
          </button>
        </div>
      </aside>
      <main className="p-6 lg:p-8">{children}</main>
    </div>
  );
}