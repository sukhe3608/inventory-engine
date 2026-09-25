'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/app/provider';
import { Card, CardHeader, Button, Badge, Field, inputClass, Modal, Empty } from '@/components/ui';
import { getWord, type WordKey } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import type {
  MemberRow, InvitationRow, ApiKeyRow, WebhookRow, WidgetConfigRow, AuditRow, ProfileRow,
} from '@/lib/types';
import { CURRENCIES, TIMEZONES } from '@/lib/i18n';
import { sendInviteEmail } from '@/lib/invites';

async function hashKey(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function genApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'inv_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Tab = 'shop' | 'team' | 'api' | 'widget' | 'webhooks' | 'audit' | 'profile';

const TABS: { id: Tab; label: string; managerOnly?: boolean }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'shop', label: 'Shop', managerOnly: true },
  { id: 'team', label: 'Team', managerOnly: true },
  { id: 'api', label: 'API keys', managerOnly: true },
  { id: 'widget', label: 'Widget', managerOnly: true },
  { id: 'webhooks', label: 'Webhooks', managerOnly: true },
  { id: 'audit', label: 'Audit log' },
];

export default function SettingsPage() {
  const app = useApp();
  const w = (k: WordKey) => getWord(app.language, k);
  const isManager = ['owner', 'manager'].includes(app.role);
  const [tab, setTab] = useState<Tab>('profile');

  const tabs = TABS.filter((t) => !t.managerOnly || isManager);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{w('settings')}</h1>
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-slate-900 text-slate-50 shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'shop' && <ShopSection w={w} />}
      {tab === 'team' && <TeamSection w={w} />}
      {tab === 'api' && <ApiSection w={w} />}
      {tab === 'widget' && <WidgetSection w={w} />}
      {tab === 'webhooks' && <WebhookSection w={w} />}
      {tab === 'audit' && <AuditSection w={w} />}
      {tab === 'profile' && <ProfileSection w={w} />}
    </div>
  );
}

function ShopSection({ w }: { w: (k: WordKey) => string }) {
  const app = useApp();
  const [form, setForm] = useState({
    name: '',
    currency: '',
    timezone: '',
    allow_negative_stock: false,
    gstin: '',
    state_code: '',
    upi_id: '',
    phone: '',
    address_line1: '',
    city: '',
    postal_code: '',
    tax_rate: '0',
    enable_tax: false,
    invoice_prefix: 'INV',
  });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await app.supabase.from('tenants').select('*').eq('id', app.tenantId).single();
      setForm({
        name: data?.name ?? '',
        currency: data?.currency ?? 'INR',
        timezone: data?.timezone ?? 'Asia/Kolkata',
        allow_negative_stock: data?.allow_negative_stock ?? false,
        gstin: data?.gstin ?? '',
        state_code: data?.state_code ?? '',
        upi_id: data?.upi_id ?? '',
        phone: data?.phone ?? '',
        address_line1: data?.address_line1 ?? '',
        city: data?.city ?? '',
        postal_code: data?.postal_code ?? '',
        tax_rate: String(data?.tax_rate ?? 0),
        enable_tax: data?.enable_tax ?? false,
        invoice_prefix: data?.invoice_prefix ?? 'INV',
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const { error } = await app.supabase
      .from('tenants')
      .update({
        name: form.name,
        currency: form.currency,
        timezone: form.timezone,
        allow_negative_stock: form.allow_negative_stock,
        gstin: form.gstin.trim() || null,
        state_code: form.state_code.trim() || null,
        upi_id: form.upi_id.trim() || null,
        phone: form.phone.trim() || null,
        address_line1: form.address_line1.trim() || null,
        city: form.city.trim() || null,
        postal_code: form.postal_code.trim() || null,
        tax_rate: Number(form.tax_rate) || 0,
        enable_tax: form.enable_tax,
        invoice_prefix: form.invoice_prefix.trim() || 'INV',
        updated_at: new Date().toISOString(),
      })
      .eq('id', app.tenantId);
    if (error) return setNotice('Error: ' + error.message);
    setNotice('Saved');
  }

  return (
    <div className="card p-6 max-w-xl space-y-4">
      <CardHeader title="Shop settings" />
      <Field label="Shop name">
        <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={w('currency')}>
          <select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {Object.entries(CURRENCIES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </Field>
        <Field label={w('timezone')}>
          <select className={inputClass} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {Object.entries(TIMEZONES).map(([tz, label]) => <option key={tz} value={tz}>{label}</option>)}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.allow_negative_stock}
          onChange={(e) => setForm({ ...form, allow_negative_stock: e.target.checked })}
        />
        Allow controlled negative stock
      </label>

      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Billing &amp; tax (appears on bills)</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label={w('gstin')}>
            <input className={inputClass} value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="27AABCS1234F1Z5" />
          </Field>
          <Field label={w('stateCode')}>
            <input className={inputClass} value={form.state_code} onChange={(e) => setForm({ ...form, state_code: e.target.value })} placeholder="27 (Maharashtra)" />
          </Field>
          <Field label={w('upiId')}>
            <input className={inputClass} value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} placeholder="shopname@okhdfcbank" />
          </Field>
          <Field label={w('phone')}>
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 space-y-1">
          <Field label={w('address')}>
            <input className={inputClass} value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field label="City">
            <input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="Postal code">
            <input className={inputClass} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field label={w('invoicePrefix')}>
            <input className={inputClass} value={form.invoice_prefix} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} placeholder="INV" />
          </Field>
          <Field label={`${w('taxRate')} %`}>
            <input type="number" min="0" max="100" step="any" className={inputClass} value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 mt-4">
          <input
            type="checkbox"
            checked={form.enable_tax}
            onChange={(e) => setForm({ ...form, enable_tax: e.target.checked })}
          />
          {w('enableTax')} (GST/CGST+SGST split on bills)
        </label>
        <p className="text-xs text-slate-400 mt-1">Add a UPI ID (e.g. name@okbank) to enable the Scannable payment QR on bills.</p>
      </div>

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Button onClick={save}>{w('saveSettings')}</Button>
    </div>
  );
}

function ProfileSection({ w }: { w: (k: WordKey) => string }) {
  const app = useApp();
  const [form, setForm] = useState({ display_name: '', language: 'en' as 'en' | 'hi' });

  useEffect(() => {
    (async () => {
      const { data } = await app.supabase.from('profiles').select('*').eq('user_id', app.user.id).single();
      setForm({
        display_name: data?.display_name ?? app.user.user_metadata?.display_name ?? '',
        language: data?.language ?? 'en',
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    await app.supabase
      .from('profiles')
      .update({ display_name: form.display_name, language: form.language })
      .eq('user_id', app.user.id);
    window.location.reload();
  }

  return (
    <Card className="p-6 max-w-xl space-y-4">
      <CardHeader title="Your profile" />
      <Field label={w('name')}>
        <input className={inputClass} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
      </Field>
      <Field label={w('email')}>
        <input className={inputClass} value={app.user.email ?? ''} disabled />
      </Field>
      <Field label={w('language')}>
        <select className={inputClass} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as 'en' | 'hi' })}>
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
        </select>
      </Field>
      <Button onClick={save}>{w('save')}</Button>
    </Card>
  );
}

function TeamSection({ w }: { w: (k: WordKey) => string }) {
  const app = useApp();
  const [members, setMembers] = useState<(MemberRow & { email?: string; display_name?: string })[]>([]);
  const [invites, setInvites] = useState<InvitationRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = app.supabase;
    const tenantId = app.tenantId;
    const [memRes, invRes] = await Promise.all([
      sb.from('tenant_members').select('*').eq('tenant_id', tenantId),
      sb.from('invitations').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    ]);
    const rows = (memRes.data ?? []) as MemberRow[];
    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } =
      userIds.length > 0
        ? await sb.from('profiles').select('user_id, email, display_name').in('user_id', userIds)
        : { data: null };
    setMembers(
      rows.map((r) => ({
        ...r,
        email: (profiles ?? []).find((p: any) => p.user_id === r.user_id)?.email,
        display_name: (profiles ?? []).find((p: any) => p.user_id === r.user_id)?.display_name,
      })),
    );
    setInvites((invRes.data ?? []) as InvitationRow[]);
  }, [app.supabase, app.tenantId]);

  useEffect(() => { load(); }, [load]);

  async function invite() {
    if (!email) return;
    const { data, error } = await app.supabase.from('invitations').insert({
      tenant_id: app.tenantId,
      email,
      role,
      token: crypto.randomUUID(),
      created_by: app.user.id,
    }).select().single();
    if (error) return setNotice('Error: ' + error.message);
    const invId = (data as InvitationRow | null)?.id;
    if (invId) {
      const res = await sendInviteEmail(invId);
      if (res.ok) {
        setNotice('Invite email sent to ' + email + '.');
      } else if (res.message === 'EMAIL_NOT_CONFIGURED') {
        const link = res.acceptLink ?? `${window.location.origin}/signup?email=${encodeURIComponent(email)}`;
        setNotice('Email sending is not configured. Share this invite link: ' + link);
      } else if (res.message === 'API_UNREACHABLE') {
        setNotice('Invite saved. Email API unreachable — sharing the invite link instead: ' + `${window.location.origin}/signup?email=${encodeURIComponent(email)}`);
      } else {
        setNotice('Invite saved, but email failed (' + res.message + ').');
      }
    } else {
      setNotice('Invited ' + email + ' — they accept on sign-up.');
    }
    setEmail('');
    load();
  }

  async function removeMember(m: MemberRow) {
    const { error } = await app.supabase.from('tenant_members').delete().eq('tenant_id', m.tenant_id).eq('user_id', m.user_id);
    if (error) return setNotice('Error: ' + error.message);
    load();
  }

  async function revokeInvite(inv: InvitationRow) {
    await app.supabase.from('invitations').delete().eq('id', inv.id);
    load();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-6">
        <CardHeader title={w('team')} />
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between text-sm">
              <div>
                <span className="text-slate-900 font-medium">{m.display_name || m.email || m.user_id}</span>
                <span className="text-slate-400 text-xs ml-2">{m.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === 'owner' ? 'blue' : m.role === 'manager' ? 'amber' : m.role === 'staff' ? 'slate' : 'slate'}>{m.role}</Badge>
                {m.role !== 'owner' && (
                  <Button variant="ghost" onClick={() => removeMember(m)}>{w('revoke')}</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <CardHeader title={w('invs')} />
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Field label={w('email')}>
              <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <Field label={w('role')}>
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="read_only">Read only</option>
            </select>
          </Field>
          <Button onClick={invite}>{w('invite')}</Button>
        </div>
        {notice && <p className="text-sm text-emerald-700 mt-2">{notice}</p>}
        {invites.length > 0 && (
          <div className="mt-4 space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{inv.email} <Badge>{inv.role}</Badge> <Badge tone={inv.status === 'pending' ? 'amber' : 'green'}>{inv.status}</Badge></span>
                <Button variant="ghost" onClick={() => revokeInvite(inv)}>{w('revoke')}</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ApiSection({ w }: { w: (k: WordKey) => string }) {
  const app = useApp();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['stock:read']);
  const [fresh, setFresh] = useState<string | null>(null);

  const SCOPES = ['stock:read', 'stock:write', 'products:read', 'orders:read', 'orders:write'];

  const load = useCallback(async () => {
    const { data } = await app.supabase.from('api_keys').select('*').eq('tenant_id', app.tenantId);
    setKeys((data ?? []) as ApiKeyRow[]);
  }, [app.supabase, app.tenantId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const raw = genApiKey();
    const hash = await hashKey(raw);
    const { error } = await app.supabase.from('api_keys').insert({
      tenant_id: app.tenantId,
      name: name || 'Untitled key',
      key_prefix: raw.slice(0, 10),
      key_hash: hash,
      scopes,
      created_by: app.user.id,
    });
    if (error) return;
    setFresh(raw);
    setName('');
    setScopes(['stock:read']);
    load();
  }

  async function revoke(k: ApiKeyRow) {
    await app.supabase.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', k.id);
    load();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-6 space-y-4">
        <CardHeader title={w('apiKeys')} subtitle="Bearer token issued to connected systems" />
        {fresh && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
            <p className="text-xs font-medium text-emerald-800">{w('showKey')}</p>
            <code className="font-mono text-sm break-all">{fresh}</code>
          </div>
        )}
        <Field label={w('name')}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Scopes">
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <button
                key={s}
                onClick={() => setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s])}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${
                  scopes.includes(s) ? 'bg-slate-900 text-slate-50 border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
        <Button onClick={create}>{w('generate')}</Button>
      </Card>

      <Card>
        <CardHeader title="Active keys" />
        {keys.length === 0 ? (
          <Empty message="No API keys" />
        ) : (
          <div className="divide-y divide-slate-100">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{k.name} <code className="font-mono text-xs text-slate-400">inv …{k.key_prefix?.slice(4)}</code></p>
                  <p className="text-xs text-slate-500">{(k.scopes ?? []).join(', ')} · last used {formatDate(k.last_used_at)}</p>
                </div>
                {k.revoked_at ? (
                  <Badge tone="rose">revoked</Badge>
                ) : (
                  <Button variant="ghost" onClick={() => revoke(k)}>{w('revokeApi')}</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function WidgetSection({ w }: { w: (k: WordKey) => string }) {
  const app = useApp();
  const [cfg, setCfg] = useState<WidgetConfigRow | null>(null);

  const load = useCallback(async () => {
    const { data } = await app.supabase.from('widget_configs').select('*').eq('tenant_id', app.tenantId).single();
    setCfg((data ?? null) as WidgetConfigRow | null);
  }, [app.supabase, app.tenantId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!cfg) return;
    await app.supabase.from('widget_configs').update({
      title: cfg.title,
      show_price: cfg.show_price,
      in_stock_label: cfg.in_stock_label,
      low_stock_label: cfg.low_stock_label,
      out_of_stock_label: cfg.out_of_stock_label,
      accent_color: cfg.accent_color,
      updated_at: new Date().toISOString(),
    }).eq('id', cfg.id);
    load();
  }

  const embed = cfg
    ? `<div id="inv-widget-cont" data-accent="${cfg.accent_color}" data-show-price="${cfg.show_price}" data-in-stock="${cfg.in_stock_label}" data-low-stock="${cfg.low_stock_label}" data-out-stock="${cfg.out_of_stock_label}">Loading stock…</div>\n<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget-embed/${cfg.widget_key}"></script>`
    : '';

  return (
    <Card className="p-6 max-w-2xl space-y-4">
      <CardHeader title="Storefront widget" subtitle="Copy this snippet into any HTML page to show live stock." />
      {cfg && (
        <>
          <Field label="Title">
            <input className={inputClass} value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="In stock"><input className={inputClass} value={cfg.in_stock_label} onChange={(e) => setCfg({ ...cfg, in_stock_label: e.target.value })} /></Field>
            <Field label="Low stock"><input className={inputClass} value={cfg.low_stock_label} onChange={(e) => setCfg({ ...cfg, low_stock_label: e.target.value })} /></Field>
            <Field label="Out of stock"><input className={inputClass} value={cfg.out_of_stock_label} onChange={(e) => setCfg({ ...cfg, out_of_stock_label: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={cfg.show_price} onChange={(e) => setCfg({ ...cfg, show_price: e.target.checked })} />
            Show price
          </label>
          <Field label="Accent color">
            <input type="color" className="h-9 w-16" value={cfg.accent_color} onChange={(e) => setCfg({ ...cfg, accent_color: e.target.value })} />
          </Field>
          <Button onClick={save}>{w('save')}</Button>
          <Field label={w('embedCode')}>
            <textarea className={`${inputClass} font-mono text-xs`} rows={3} readOnly value={embed} />
          </Field>
          <CopyButton embed={embed} />
        </>
      )}
    </Card>
  );
}

function CopyButton({ embed }: { embed: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(embed);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function WebhookSection({ w }: { w: (k: WordKey) => string }) {
  const app = useApp();
  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [form, setForm] = useState({ url: '', secret: '', events: ['stock.updated'] });
  const EVENTS = ['stock.updated', 'order.created', 'order.updated'];

  const load = useCallback(async () => {
    const { data } = await app.supabase.from('webhook_endpoints').select('*').eq('tenant_id', app.tenantId);
    setHooks((data ?? []) as WebhookRow[]);
  }, [app.supabase, app.tenantId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!form.url) return;
    await app.supabase.from('webhook_endpoints').insert({
      tenant_id: app.tenantId,
      url: form.url,
      secret: form.secret || Math.random().toString(36).slice(2),
      events: form.events,
      active: true,
    });
    setForm({ url: '', secret: '', events: ['stock.updated'] });
    load();
  }

  async function toggleActive(hook: WebhookRow) {
    await app.supabase.from('webhook_endpoints').update({ active: !hook.active, updated_at: new Date().toISOString() }).eq('id', hook.id);
    load();
  }

  async function remove(hook: WebhookRow) {
    await app.supabase.from('webhook_endpoints').delete().eq('id', hook.id);
    load();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-6 space-y-4">
        <CardHeader title="Webhook endpoints" subtitle="Events are pushed within ~60s with HMAC-SHA256 signature headers." />
        <Field label={w('endpoint')}>
          <input className={inputClass} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </Field>
        <Field label={w('secret')}>
          <input className={inputClass} value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="Leave blank to auto-generate" />
        </Field>
        <Field label={w('events')}>
          <div className="flex flex-wrap gap-2">
            {EVENTS.map((ev) => (
              <button
                key={ev}
                onClick={() => setForm({ ...form, events: form.events.includes(ev) ? form.events.filter((x) => x !== ev) : [...form.events, ev] })}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${
                  form.events.includes(ev) ? 'bg-slate-900 text-slate-50 border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
                }`}
              >
                {ev}
              </button>
            ))}
          </div>
        </Field>
        <Button onClick={add}>{w('addWebhook')}</Button>
      </Card>

      <Card>
        {hooks.length === 0 ? (
          <Empty message="No webhooks yet" />
        ) : (
          <div className="divide-y divide-slate-100">
            {hooks.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{h.url}</p>
                  <p className="text-xs text-slate-500">{(h.events ?? []).join(', ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={h.active ? 'green' : 'slate'}>{h.active ? 'active' : 'paused'}</Badge>
                  <Button variant="ghost" onClick={() => toggleActive(h)}>{h.active ? 'Pause' : 'Resume'}</Button>
                  <Button variant="ghost" onClick={() => remove(h)}>{w('delete')}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AuditSection({ w }: { w: (k: WordKey) => string }) {
  const app = useApp();
  const [logs, setLogs] = useState<AuditRow[]>([]);

  const load = useCallback(async () => {
    const { data } = await app.supabase
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', app.tenantId)
      .order('created_at', { ascending: false })
      .limit(100);
    setLogs((data ?? []) as AuditRow[]);
  }, [app.supabase, app.tenantId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader title="Audit log" subtitle="Who did what, and when." />
      {logs.length === 0 ? (
        <Empty message="No audit entries yet" />
      ) : (
        <div className="divide-y divide-slate-100">
          {logs.map((l) => (
            <div key={l.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <span className="text-slate-900 font-medium">{l.action}</span>
                <span className="text-slate-400 text-xs ml-2">{l.entity_type ?? ''}</span>
              </div>
              <div className="text-right">
                <p className="text-slate-500">{l.actor_role ?? 'api'}</p>
                <p className="text-xs text-slate-400">{formatDate(l.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}