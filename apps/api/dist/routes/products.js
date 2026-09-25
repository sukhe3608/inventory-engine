import { requireScopes } from '../auth.js';
import { isUuid } from '../lib/uuid.js';
export const productsRoutes = async (app) => {
    app.get('/v1/products', { preHandler: await requireScopes(['products:read']) }, async (request, reply) => {
        const apiKey = request.apiKey;
        const { rows } = await app.db.query(`select
           p.id, p.name, p.description, p.category_id, c.name as category_name, p.active,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', v.id, 'sku', v.sku, 'name', v.name, 'price', v.price, 'active', v.active
             ) order by v.created_at)
             from public.variants v
             where v.product_id = p.id and v.tenant_id = $1
           ), '[]'::jsonb) as variants,
           coalesce((
             select sum(sl.quantity_on_hand)::text
             from public.stock_levels sl
             join public.variants v on v.id = sl.variant_id
             where v.product_id = p.id and sl.tenant_id = $1
           ), '0') as total_stock
         from public.products p
         left join public.categories c on c.id = p.category_id
         where p.tenant_id = $1
         order by p.created_at desc`, [apiKey.tenantId]);
        return { products: rows, count: rows.length };
    });
    app.get('/v1/products/:id', { preHandler: await requireScopes(['products:read']) }, async (request, reply) => {
        const apiKey = request.apiKey;
        const { id } = request.params;
        if (!isUuid(id)) {
            return reply.code(400).send({ error: 'INVALID_PRODUCT_ID' });
        }
        const { rows } = await app.db.query(`select
           p.id, p.name, p.description, p.category_id, c.name as category_name, p.active,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', v.id, 'sku', v.sku, 'name', v.name, 'price', v.price, 'active', v.active
             ) order by v.created_at)
             from public.variants v
             where v.product_id = p.id and v.tenant_id = $1
           ), '[]'::jsonb) as variants
         from public.products p
         left join public.categories c on c.id = p.category_id
         where p.id = $2 and p.tenant_id = $1`, [apiKey.tenantId, id]);
        const product = rows[0];
        if (!product) {
            return reply.code(404).send({ error: 'PRODUCT_NOT_FOUND' });
        }
        return { product };
    });
};
