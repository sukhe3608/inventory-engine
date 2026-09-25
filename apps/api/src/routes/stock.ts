import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScopes } from '../auth.js';
import { isUuid } from '../lib/uuid.js';
import { fromProcError, validationError } from '../lib/errors.js';

const stockQuerySchema = z.object({
  variant_id: z.string().optional(),
  location_id: z.string().optional(),
  since: z.string().optional(),
});

const stockHistoryQuerySchema = z.object({
  variant_id: z.string().optional(),
  location_id: z.string().optional(),
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const adjustmentSchema = z.object({
  variant_id: z.string(),
  location_id: z.string(),
  change_qty: z.number(),
  reason: z.string().max(500).optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
});

function buildFilters(
  tenantId: string,
  query: { variant_id?: string; location_id?: string; since?: string },
) {
  const clauses: string[] = ['sl.tenant_id = $1'];
  const params: unknown[] = [tenantId];
  if (query.variant_id) {
    if (!isUuid(query.variant_id)) return { error: 'INVALID_VARIANT_ID' };
    params.push(query.variant_id);
    clauses.push(`sl.variant_id = $${params.length}`);
  }
  if (query.location_id) {
    if (!isUuid(query.location_id)) return { error: 'INVALID_LOCATION_ID' };
    params.push(query.location_id);
    clauses.push(`sl.location_id = $${params.length}`);
  }
  if (query.since) {
    const parsed = new Date(query.since);
    if (Number.isNaN(parsed.getTime())) return { error: 'INVALID_SINCE' };
    params.push(parsed.toISOString());
    clauses.push(`sl.updated_at > $${params.length}`);
  }
  return { clauses, params };
}

export const stockRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/v1/stock',
    { preHandler: await requireScopes(['stock:read']) },
    async (request, reply) => {
      const apiKey = request.apiKey!;
      const parsed = stockQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_QUERY', detail: parsed.error.flatten() });
      }
      const filters = buildFilters(apiKey.tenantId, parsed.data);
      if ('error' in filters) {
        return reply.code(400).send({ error: filters.error });
      }
      const { rows } = await app.db.query(
        `select
           sl.id, sl.variant_id, v.sku, coalesce(v.name, p.name) as name,
           sl.location_id, l.name as location_name,
           sl.quantity_on_hand, sl.quantity_reserved, sl.quantity_available,
           sl.low_stock_threshold, sl.updated_at
         from public.stock_levels sl
         join public.variants v on v.id = sl.variant_id
         join public.products p on p.id = v.product_id
         join public.locations l on l.id = sl.location_id
         where ${filters.clauses.join(' and ')}
         order by v.sku, l.name`,
        filters.params,
      );
      return { stock: rows, count: rows.length };
    },
  );

  app.get(
    '/v1/stock/history',
    { preHandler: await requireScopes(['stock:read']) },
    async (request, reply) => {
      const apiKey = request.apiKey!;
      const parsed = stockHistoryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_QUERY', detail: parsed.error.flatten() });
      }
      const q = parsed.data;
      const clauses: string[] = ['t.tenant_id = $1'];
      const params: unknown[] = [apiKey.tenantId];
      if (q.variant_id) {
        if (!isUuid(q.variant_id)) return reply.code(400).send({ error: 'INVALID_VARIANT_ID' });
        params.push(q.variant_id);
        clauses.push(`t.variant_id = $${params.length}`);
      }
      if (q.location_id) {
        if (!isUuid(q.location_id)) return reply.code(400).send({ error: 'INVALID_LOCATION_ID' });
        params.push(q.location_id);
        clauses.push(`t.location_id = $${params.length}`);
      }
      if (q.since) {
        const parsedDate = new Date(q.since);
        if (Number.isNaN(parsedDate.getTime())) return reply.code(400).send({ error: 'INVALID_SINCE' });
        params.push(parsedDate.toISOString());
        clauses.push(`t.created_at > $${params.length}`);
      }
      params.push(q.limit);
      const { rows } = await app.db.query(
        `select
           t.id, t.variant_id, v.sku, v.name as variant_name,
           t.location_id, l.name as location_name,
           t.change_qty, t.qty_after, t.transaction_type, t.reference_type, t.reference_id,
           t.actor_name, t.notes, t.created_at
         from public.stock_transactions t
         join public.variants v on v.id = t.variant_id
         join public.locations l on l.id = t.location_id
         where ${clauses.join(' and ')}
         order by t.created_at desc
         limit $${params.length}`,
        params,
      );
      return { history: rows, count: rows.length };
    },
  );

  const handleStockWrite =
    (transactionType: 'adjustment' | 'opening_balance') =>
    async (request: any, reply: any) => {
      const apiKey = request.apiKey!;
      const parsed = adjustmentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', detail: parsed.error.flatten() });
      }
      const body = parsed.data;
      if (!isUuid(body.variant_id) || !isUuid(body.location_id)) {
        return reply.code(400).send(validationError('INVALID_UUID'));
      }
      try {
        const { rows } = await app.db.query(
          `select * from public.apply_stock_change(
             $1::uuid, $2::uuid, $3::numeric, $4::text, null, null, $5::text, $6::text,
             null, $7::text, $8::uuid)`,
          [body.location_id, body.variant_id, body.change_qty, transactionType,
           body.reason, body.idempotency_key ?? null, 'api:' + apiKey.name, apiKey.tenantId],
        );
        const result = rows[0].apply_stock_change;
        return reply
          .code(result.idempotent ? 200 : 201)
          .send({ ...result, transaction_type: transactionType, tenant_id: apiKey.tenantId });
      } catch (err) {
        const apiErr = fromProcError(err);
        return reply.code(apiErr.status).send({ error: apiErr.message, code: apiErr.code });
      }
    };

  app.post(
    '/v1/stock/adjustments',
    { preHandler: await requireScopes(['stock:write']) },
    handleStockWrite('adjustment'),
  );

  app.post(
    '/v1/stock/opening-balances',
    { preHandler: await requireScopes(['stock:write']) },
    handleStockWrite('opening_balance'),
  );
};