import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { AppProvider } from '@/components/app/provider';
import { Shell } from '@/components/app/shell';
import type { ProfileRow, TenantRow } from '@/lib/types';
import type { Language } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle<ProfileRow>();

  const { data: members, error: membersError } = await supabase
    .from('tenant_members')
    .select('tenant_id, role')
    .order('created_at');

  if (membersError) {
    throw new Error(membersError.message);
  }

  const memberTenantIds = (members ?? []).map((m) => m.tenant_id);
  const { data: tenants } = memberTenantIds.length
    ? await supabase.from('tenants').select('*').in('id', memberTenantIds)
    : { data: [] as TenantRow[] | null };

  const cookieStore = await cookies();
  const selected = cookieStore.get('tenant_id')?.value;
  const activeTenant = tenants?.find((t) => t.id === selected) ?? tenants?.[0];
  const activeMember = members?.find((m) => m.tenant_id === activeTenant?.id);

  return (
    <AppProvider
      user={user}
      tenantId={activeTenant?.id ?? ''}
      tenantName={activeTenant?.name ?? ''}
      role={activeMember?.role ?? 'read_only'}
      currency={activeTenant?.currency ?? 'INR'}
      language={(profile?.language ?? 'en') as Language}
      timezone={activeTenant?.timezone ?? 'Asia/Kolkata'}
      isPlatformAdmin={profile?.is_platform_admin ?? false}
    >
      <Shell>{children}</Shell>
    </AppProvider>
  );
}