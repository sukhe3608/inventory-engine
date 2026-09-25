import { sha256Hex } from './lib/crypto.js';
const KEY_LIMIT_MAX = Number(process.env.KEY_RATE_LIMIT_MAX ?? 600);
const keyLimits = new Map();
function checkKeyLimit(keyId) {
    const now = Date.now();
    const entry = keyLimits.get(keyId);
    if (!entry || entry.resetAt <= now) {
        keyLimits.set(keyId, { count: 1, resetAt: now + 60_000 });
        return true;
    }
    if (entry.count >= KEY_LIMIT_MAX) {
        return false;
    }
    entry.count += 1;
    return true;
}
export async function requireScopes(scopes) {
    return async (request, reply) => {
        const auth = request.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) {
            return reply.code(401).send({ error: 'UNAUTHORIZED_MISSING_API_KEY' });
        }
        const token = auth.slice(7);
        if (!token) {
            return reply.code(401).send({ error: 'UNAUTHORIZED_MISSING_API_KEY' });
        }
        const db = request.server.db;
        const hash = sha256Hex(token);
        const { rows } = await db.query(`select k.id, k.tenant_id, k.scopes, k.name, k.revoked_at, t.status as tenant_status, k.last_used_at
       from public.api_keys k
       join public.tenants t on t.id = k.tenant_id
       where k.key_hash = $1`, [hash]);
        const row = rows[0];
        if (!row || row.revoked_at) {
            return reply.code(401).send({ error: 'UNAUTHORIZED_INVALID_API_KEY' });
        }
        if (row.tenant_status !== 'active') {
            return reply.code(403).send({ error: 'TENANT_SUSPENDED' });
        }
        if (!checkKeyLimit(row.id)) {
            return reply.code(429).send({ error: 'RATE_LIMITED' });
        }
        const accepted = new Set(scopes);
        const hasScope = scopes.some((s) => row.scopes.includes(s));
        if (!hasScope) {
            return reply.code(403).send({ error: 'FORBIDDEN_SCOPE', requires: accepted });
        }
        const now = new Date();
        const lastUsed = row.last_used_at ? new Date(row.last_used_at).getTime() : 0;
        if (now.getTime() - lastUsed > 60_000) {
            db.query(`update public.api_keys set last_used_at = now() where id = $1`, [row.id]).catch(() => undefined);
        }
        request.apiKey = {
            keyId: row.id,
            tenantId: row.tenant_id,
            scopes: row.scopes,
            name: row.name,
        };
    };
}
