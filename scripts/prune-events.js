import pg from 'pg';

const days = Number(process.env.EVENT_RETENTION_DAYS || 365);
if (!process.env.DATABASE_URL || !Number.isInteger(days) || days < 1 || days > 3650) {
  console.error('Set DATABASE_URL and EVENT_RETENTION_DAYS (1–3650).');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined });
try {
  const result = await pool.query("DELETE FROM events WHERE created_at < now() - ($1 * interval '1 day')", [days]);
  await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
  await pool.query('DELETE FROM oidc_transactions WHERE expires_at <= now()');
  console.log(`Pruned ${result.rowCount} expired events.`);
} catch (error) {
  console.error(`Event retention task failed: ${error.message}`);
  process.exitCode = 1;
} finally { await pool.end(); }
