import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { healthRoutes } from './routes/health.js';
import { productsRoutes } from './routes/products.js';
import { stockRoutes } from './routes/stock.js';
import { ordersRoutes } from './routes/orders.js';
import { invitationsRoutes } from './routes/invitations.js';

const config = loadConfig();
const app = Fastify({ logger: true, trustProxy: config.trustProxy });

await app.register(cors, { origin: config.corsOrigin });
await app.register(helmet);
await app.register(rateLimit, {
  max: config.rateLimitMax,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED' }),
});

const db = createDatabase(config.databaseUrl);
app.decorate('db', db);
app.decorate('config', config);

await app.register(healthRoutes);
await app.register(productsRoutes);
await app.register(stockRoutes);
await app.register(ordersRoutes);
await app.register(invitationsRoutes);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async () => {
  await db.pool.end();
  await app.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);