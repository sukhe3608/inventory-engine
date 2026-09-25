import { NextResponse } from 'next/server';
import { currentPlatformAdmin } from '@/lib/supabase/admin-session';
import { adminClientCache } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const adminUserId = await currentPlatformAdmin();
  if (!adminUserId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { userId, password, email } = (await request.json().catch(() => ({}))) as {
    userId?: string;
    password?: string;
    email?: string;
  };
  if (!userId) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const generated = password && password.length >= 8 ? password : `Gen@${crypto.randomUUID().slice(0, 8)}`;
  const adminClient = adminClientCache();
  const { data, error } = await adminClient.auth.admin.updateUserById(userId, { password: generated });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await adminClient.from('audit_logs').insert({
    actor_user_id: adminUserId,
    actor_role: 'platform_admin',
    action: 'platform.reset_password',
    entity_type: 'user',
    entity_id: userId,
    meta: { target_email: email ?? null },
  });

  return NextResponse.json({ ok: true, tempPassword: generated, email: data.user.email ?? email ?? null });
}