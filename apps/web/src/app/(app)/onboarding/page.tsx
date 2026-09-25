'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/app/provider';
import { Button, Field, inputClass } from '@/components/ui';
import { getWord, CURRENCIES, TIMEZONES, type WordKey } from '@/lib/i18n';
import { sendInviteEmail } from '@/lib/invites';

export default function OnboardingPage() {
  const router = useRouter();
  const app = useApp();
  const w = (k: WordKey) => getWord(app.language, k);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [locations, setLocations] = useState([{ name: 'Main Store', city: '' }]);
  const [invites, setInvites] = useState<{ email: string; role: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (app.tenantId) router.push('/dashboard');
  }, [app.tenantId, router]);

  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (app.tenantId) return;
    let done = false;
    setAccepting(true);
    (async () => {
      const { data, error } = await app.supabase.rpc('accept_invitation');
      if (done) return;
      setAccepting(false);
      if (!error && data?.accepted) {
        if (data.tenant_id) {
          document.cookie = `tenant_id=${data.tenant_id}; path=/; max-age=31536000; SameSite=Lax`;
        }
        router.push('/dashboard');
        router.refresh();
      }
    })();
    return () => {
      done = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.tenantId]);

  if (accepting && !app.tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="card p-8 text-center space-y-2 max-w-sm">
          <p className="text-sm text-slate-600">{w('youveBeenInvited')}</p>
        </div>
      </div>
    );
  }

  if (app.tenantId) return null;

  function slugify(v: string) {
    return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
  }

  async function finish() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await app.supabase.rpc('create_tenant', {
        p_name: name,
        p_slug: slug || slugify(name),
        p_currency: currency,
        p_timezone: timezone,
      });
      if (rpcErr) throw rpcErr;
      const tenantId = data.tenant_id;

      for (const loc of locations.filter((l) => l.name.trim())) {
        await app.supabase.from('locations').insert({
          tenant_id: tenantId,
          name: loc.name.trim(),
          location_type: 'store',
          city: loc.city.trim() || null,
        });
      }

      for (const inv of invites.filter((i) => i.email)) {
        const { data: invRow } = await app.supabase
          .from('invitations')
          .insert({
            tenant_id: tenantId,
            email: inv.email,
            role: inv.role,
            token: crypto.randomUUID(),
            created_by: app.user.id,
          })
          .select('id')
          .single();
        if (invRow?.id) {
          await sendInviteEmail(invRow.id);
        }
      }

      document.cookie = `tenant_id=${tenantId}; path=/; max-age=31536000; SameSite=Lax`;
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg card p-6">
        <h1 className="text-xl font-bold text-slate-900 mb-1">Set up your shop</h1>
        <p className="text-sm text-slate-500 mb-4">Three quick steps to go live.</p>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`h-2 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-emerald-600' : 'bg-slate-200'
                }`}
              />
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <Field label="Shop name">
              <input
                className={inputClass}
                placeholder="e.g. Acme Fashion"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug || slug === slugify(name)) setSlug(slugify(e.target.value));
                }}
              />
            </Field>
            <Field label="URL slug">
              <input className={inputClass} placeholder="acme-fashion" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Currency">
                <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {Object.entries(CURRENCIES).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Timezone">
                <select className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {Object.entries(TIMEZONES).map(([tz, label]) => (
                    <option key={tz} value={tz}>{label}</option>
                  ))}
                </select>
              </Field>
            </div>
            {!name.trim() && <p className="text-xs text-slate-400">Enter a shop name to continue.</p>}
            <Button onClick={() => setStep(2)} disabled={!name.trim()} variant="primary">
              Next
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Add at least one location for your stock.</p>
            {locations.map((loc, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <Field label="Location name">
                  <input className={inputClass} value={loc.name} onChange={(e) => { const n = [...locations]; n[i].name = e.target.value; setLocations(n); }} />
                </Field>
                <Field label="City (optional)">
                  <input className={inputClass} value={loc.city} onChange={(e) => { const n = [...locations]; n[i].city = e.target.value; setLocations(n); }} />
                </Field>
              </div>
            ))}
            <Button variant="ghost" onClick={() => setLocations([...locations, { name: '', city: '' }])}>
              + Add another location
            </Button>
            <div className="flex gap-2">
              <Button onClick={() => setStep(3)}>Next</Button>
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Optional: invite team members before you start.</p>
            {invites.map((inv, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-3">
                <Field label="Email">
                  <input className={inputClass} value={inv.email} onChange={(e) => { const n = [...invites]; n[i].email = e.target.value; setInvites(n); }} />
                </Field>
                <Field label="Role">
                  <select className={inputClass} value={inv.role} onChange={(e) => { const n = [...invites]; n[i].role = e.target.value; setInvites(n); }}>
                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                    <option value="read_only">Read only</option>
                  </select>
                </Field>
              </div>
            ))}
            <Button variant="ghost" onClick={() => setInvites([...invites, { email: '', role: 'staff' }])}>
              + Invite someone
            </Button>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="primary" onClick={finish} disabled={loading}>
                {loading ? 'Creating…' : 'Create shop'}
              </Button>
              <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}