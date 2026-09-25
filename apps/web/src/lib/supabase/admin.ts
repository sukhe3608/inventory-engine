import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

/** Server-only client with the service role key. Never import from client components. */
export function adminClientCache(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!adminClient) {
    adminClient = createClient(url, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}