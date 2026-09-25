export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export async function sendInviteEmail(
  invitationId: string,
): Promise<{ ok: boolean; acceptLink?: string; message?: string }> {
  try {
    const res = await fetch(`${API_URL}/v1/invitations/${invitationId}/send-email`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) return { ok: false, message: body.error ?? 'Not found' };
      return {
        ok: false,
        acceptLink: body.acceptLink,
        message: res.status === 503 ? 'EMAIL_NOT_CONFIGURED' : (body.error ?? 'Email failed'),
      };
    }
    return { ok: true, acceptLink: body.acceptLink };
  } catch {
    return { ok: false, message: 'API_UNREACHABLE' };
  }
}