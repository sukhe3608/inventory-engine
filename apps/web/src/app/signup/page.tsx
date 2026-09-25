'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

let supabaseClient: SupabaseClient | null = null;
function getClient() {
  if (!supabaseClient) supabaseClient = createClient();
  return supabaseClient;
}

function SignupContent() {
  const router = useRouter();
  const params = useSearchParams();
  const prefilledEmail = params.get('email') ?? '';
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const { error } = await getClient().auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const {
      data: { session },
    } = await getClient().auth.getSession();
    if (session) {
      router.push('/onboarding');
      router.refresh();
    } else {
      setNotice('Check your email to confirm your account, then sign in.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-slate-900 ring-1 ring-slate-900/10 flex items-center justify-center text-slate-50 text-lg font-bold tracking-tight shadow-lg">
            IE
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-5">Inventory Engine</h1>
          <p className="text-sm text-slate-500 mt-1.5">Create your account</p>
        </div>
        <form onSubmit={onSubmit} className="card mt-6 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-500"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-50 shadow-sm hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="text-sm text-slate-500 text-center mt-4">
          Already have an account?{' '}
          <Link href="/login" className="text-slate-900 font-semibold hover:text-emerald-700 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}