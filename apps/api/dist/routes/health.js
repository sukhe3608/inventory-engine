export async function healthRoutes(app) {
    app.get('/health', async () => {
        let db = 'ok';
        try {
            await app.db.query('select 1');
        }
        catch {
            db = 'degraded';
        }
        return { ok: db === 'ok', db, ts: new Date().toISOString() };
    });
}
