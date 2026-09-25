import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from './admin-shell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('user_id', user.id)
    .maybeSingle<{ is_platform_admin: boolean }>();

  if (!profile?.is_platform_admin) {
    redirect('/dashboard');
  }

  return <AdminShell user={user} isPlatformAdmin>{children}</AdminShell>;
}