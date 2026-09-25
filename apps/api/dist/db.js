import pg from 'pg';
export function createDatabase(databaseUrl) {
    const pool = new pg.Pool({
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        application_name: 'inventory-engine-api',
    });
    pool.on('error', (err) => {
        console.error('pg pool error', err);
    });
    return { query: pool.query.bind(pool), pool };
}
