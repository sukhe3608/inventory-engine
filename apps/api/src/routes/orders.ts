import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScopes } from '../auth.js';
import { isUuid } from '../lib/uuid.js';
import { fromProcError, validationError } from '../lib/errors.js';

const orderItemSchema = z.object({
  variant_id: z.string(),
  quantity: z.number().positive(),
  unit_price: z.number().positive().optional(),
  location_id: z.string().optional(),
});

const createOrderSchema = z.object({
  customer_name: z.string().max(200).optional(),
  customer_email: z.string().email().optional(),
  customer_gstin: z.string().max(20).optional(),
  currency: z.string().length(3).optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  discount: z.number().min(0).optional(),
  billing_meta: z.record(z.unknown()).optional(),
  items: z.array(orderItemSchema).min(1).max(200),
});

export const ordersRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/v1/orders',
    { preHandler: await requireScopes(['orders:read']) },
    async (request, reply) => {
      const apiKey = request.apiKey!;
      const { rows } = await app.db.query(
        `select o.*,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', oi.id, 'variant_id', oi.variant_id, 'location_id', oi.location_id,
               'quantity', oi.quantity, 'unit_price', oi.unit_price, 'subtotal', oi.subtotal
             ))
             from public.order_items oi
             where oi.order_id = o.id
           ), '[]'::jsonb) as items
         from public.orders o
         where o.tenant_id = $1
         order by o.created_at desc
         limit 200`,
        [apiKey.tenantId],
      );
      return { orders: rows, count: rows.length };
    },
  );

  app.post(
    '/v1/orders',
    { preHandler: await requireScopes(['orders:write']) },
    async (request, reply) => {
      const apiKey = request.apiKey!;
      const idempotencyKey = request.headers['idempotency-key'];
      if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
        return reply.code(400).send({ error: 'MISSING_IDEMPOTENCY_KEY' });
      }
      const parsed = createOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', detail: parsed.error.flatten() });
      }
      const body = parsed.data;
      for (const item of body.items) {
        if (!isUuid(item.variant_id)) return reply.code(400).send(validationError('INVALID_VARIANT_ID'));
        if (item.location_id && !isUuid(item.location_id)) return reply.code(400).send(validationError('INVALID_LOCATION_ID'));
      }
      try {
        const { rows } = await app.db.query(
          `select * from public.create_order(
             $1::jsonb, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text,
             null, null, $8::text, $9::uuid, $10::numeric, $11::numeric, $12::text, $13::jsonb)`,
          [
            JSON.stringify(body.items),
            body.customer_name ?? null,
            body.customer_email ?? null,
            body.currency ?? 'INR',
            body.source ?? 'api',
            idempotencyKey,
            body.notes ?? null,
            'api:' + apiKey.name,
            apiKey.tenantId,
            body.tax_rate ?? null,
            body.discount ?? null,
            body.customer_gstin ?? null,
            body.billing_meta ? JSON.stringify(body.billing_meta) : '{}',
          ],
        );
        const result = rows[0].create_order;
        return reply.code(result.idempotent ? 200 : 201).send(result);
      } catch (err) {
        const apiErr = fromProcError(err);
        return reply.code(apiErr.status).send({ error: apiErr.message, code: apiErr.code });
      }
    },
  );

  app.post(
    '/v1/orders/:id/cancel',
    { preHandler: await requireScopes(['orders:write']) },
    async (request, reply) => {
      const apiKey = request.apiKey!;
      const { id } = request.params as { id: string };
      if (!isUuid(id)) {
        return reply.code(400).send({ error: 'INVALID_ORDER_ID' });
      }
      try {
        const { rows } = await app.db.query(
          `select * from public.update_order_status($1::uuid, 'cancelled', null, $2::text, $3::uuid)`,
          [id, 'api:' + apiKey.name, apiKey.tenantId],
        );
        return reply.send(rows[0].update_order_status);
      } catch (err) {
        const apiErr = fromProcError(err);
        return reply.code(apiErr.status).send({ error: apiErr.message, code: apiErr.code });
      }
    },
  );
};