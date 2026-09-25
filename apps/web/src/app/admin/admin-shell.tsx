'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useMemo } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

interface AdminState {
  supabase: SupabaseClient;
  user: User;
  isPlatformAdmin: boolean;
}

const AdminContext = createContext<AdminState | null>(null);

export function useAdmin(): AdminState {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminShell');
  return ctx;
}

const ADMIN_NAV = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/support', label: 'Support' },
];

export function AdminShell({ user, isPlatformAdmin, children }: { user: User; isPlatformAdmin: boolean; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <AdminContext.Provider value={{ supabase, user, isPlatformAdmin }}>
      <div className="min-h-screen bg-slate-100">
        <header className="bg-slate-950 text-slate-50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-8 w-8 rounded-lg bg-white/10 ring-1 ring-white/20 flex items-center justify-center text-sm font-bold shrink-0">
                IE
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">Platform Admin Console</p>
                <p className="text-xs text-slate-400 leading-tight truncate">Inventory Engine · tenant support & operations</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline text-xs text-slate-300">{user.email}</span>
              <Link
                href="/dashboard"
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                Open shop app
              </Link>
              <button
                onClick={signOut}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-rose-500/90 hover:bg-rose-500 text-white transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
          <nav className="mx-auto max-w-7xl px-4 sm:px-6 flex gap-1 pb-0">
            {ADMIN_NAV.map((n) => {
              const active = n.href === '/admin/dashboard' ? pathname === '/admin/dashboard' : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                    active ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-white/5 hover:text-slate-50'
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">{children}</main>
      </div>
    </AdminContext.Provider>
  );
}