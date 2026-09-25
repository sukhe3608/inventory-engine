import { Resend } from 'resend';
import { isUuid } from '../lib/uuid.js';
export const invitationsRoutes = async (app) => {
    app.post('/v1/invitations/:id/send-email', async (request, reply) => {
        const { id } = request.params;
        if (!isUuid(id)) {
            return reply.code(400).send({ error: 'INVALID_INVITATION_ID' });
        }
        const { rows, } = await app.db.query(`select i.id, i.tenant_id, i.email, i.role, i.token, i.status, t.name as tenant_name
       from public.invitations i
       join public.tenants t on t.id = i.tenant_id
       where i.id = $1`, [id]);
        const inv = rows[0];
        if (!inv) {
            return reply.code(404).send({ error: 'INVITATION_NOT_FOUND' });
        }
        if (inv.status !== 'pending') {
            return reply.code(409).send({ error: 'INVITATION_NOT_PENDING' });
        }
        if (!app.config.emailEnabled) {
            return reply.code(503).send({
                error: 'EMAIL_NOT_CONFIGURED',
                detail: 'Set RESEND_API_KEY on the API to enable invite emails.',
                acceptLink: `${app.config.webUrl}/signup?email=${encodeURIComponent(inv.email)}`,
            });
        }
        const acceptUrl = `${app.config.webUrl}/signup?email=${encodeURIComponent(inv.email)}`;
        let resend;
        try {
            resend = new Resend(app.config.resendApiKey);
        }
        catch {
            return reply.code(503).send({ error: 'EMAIL_NOT_CONFIGURED' });
        }
        try {
            const { error } = await resend.emails.send({
                from: app.config.emailFrom,
                to: [inv.email],
                subject: `You're invited to ${inv.tenant_name} on Inventory Engine`,
                html: `<div style="font-family:Inter,Arial,sans-serif;background:#faf7f1;padding:32px;border-radius:16px;max-width:520px;margin:auto">
  <h2 style="color:#0f172a;margin:0 0 8px">You're invited to <strong>${inv.tenant_name}</strong></h2>
  <p style="color:#64748b;margin:0 0 20px">Role: <strong>${inv.role}</strong></p>
  <p style="color:#0f172a;margin:0 0 24px">Create your account to accept this invitation and start working with the team.</p>
  <a href="${acceptUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600">Accept invitation</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Inventory Engine · secure multi-tenant inventory</p>
</div>`,
            });
            if (error) {
                return reply.code(500).send({ error: 'EMAIL_SEND_FAILED', detail: error.message });
            }
        }
        catch (err) {
            return reply.code(500).send({ error: 'EMAIL_SEND_FAILED', detail: err.message });
        }
        return reply.send({
            sent: true,
            to: inv.email,
            acceptLink: acceptUrl,
        });
    });
};
