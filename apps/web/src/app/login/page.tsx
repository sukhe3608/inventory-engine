'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const next = searchParams.get('next');
    router.push(next && next.startsWith('/') && !next.startsWith('/api') ? next : '/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card mt-6 p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Password</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-500"
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-50 shadow-sm hover:bg-slate-800 transition-colors disabled:opacity-50"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-slate-900 ring-1 ring-slate-900/10 flex items-center justify-center text-slate-50 text-lg font-bold tracking-tight shadow-lg">
            IE
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-5">Inventory Engine</h1>
          <p className="text-sm text-slate-500 mt-1.5">Sign in to your shop</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <p className="text-sm text-slate-500 text-center mt-4">
          No account?{' '}
          <Link href="/signup" className="text-slate-900 font-semibold hover:text-emerald-700 transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}