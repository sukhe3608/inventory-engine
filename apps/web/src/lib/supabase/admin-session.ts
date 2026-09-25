import { createClient as createSsrClient } from '@/lib/supabase/server';

/** Verify the current cookie session belongs to a platform admin; returns the user id or null. */
export async function currentPlatformAdmin(): Promise<string | null> {
  const supabase = await createSsrClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('user_id', user.id)
    .maybeSingle();
  return profile?.is_platform_admin ? user.id : null;
}