export interface AppConfig {
  databaseUrl: string;
  port: number;
  rateLimitMax: number;
  trustProxy: boolean;
  corsOrigin: string;
  resendApiKey: string;
  emailFrom: string;
  webUrl: string;
  emailEnabled: boolean;
}

export function loadConfig(): AppConfig {
  const databaseUrl =
    process.env.DATABASE_URL ??
    `postgresql://postgres:${process.env.DB_PASSWORD ?? ''}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_NAME ?? 'postgres'}`;
  return {
    databaseUrl,
    port: Number(process.env.PORT ?? 8080),
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 300),
    trustProxy: (process.env.TRUST_PROXY ?? 'false') === 'true',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    emailFrom: process.env.EMAIL_FROM ?? 'Inventory Engine <onboarding@resend.dev>',
    webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
    emailEnabled: Boolean(process.env.RESEND_API_KEY),
  };
}