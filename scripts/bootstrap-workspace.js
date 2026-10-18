import { randomBytes } from 'node:crypto';
import pg from 'pg';

const { DATABASE_URL, AUTH0_ISSUER, BOOTSTRAP_OIDC_SUBJECT, BOOTSTRAP_EMAIL, BOOTSTRAP_NAME, BOOTSTRAP_WORKSPACE_ID, BOOTSTRAP_WORKSPACE_NAME, BOOTSTRAP_WORKSPACE_SLUG } = process.env;
if (![DATABASE_URL, AUTH0_ISSUER, BOOTSTRAP_OIDC_SUBJECT, BOOTSTRAP_EMAIL, BOOTSTRAP_NAME, BOOTSTRAP_WORKSPACE_ID, BOOTSTRAP_WORKSPACE_NAME, BOOTSTRAP_WORKSPACE_SLUG].every(Boolean)) {
  console.error('Bootstrap requires DB/OIDC issuer and explicit first-admin/workspace values in environment.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE workspaces IN EXCLUSIVE MODE');
    const existing = await client.query('SELECT 1 FROM workspaces LIMIT 1');
    if (existing.rowCount) throw new Error('Bootstrap refused: at least one workspace already exists');
    const user = await client.query('INSERT INTO users (id,oidc_issuer,oidc_subject,email,display_name) VALUES ($1,$2,$3,$4,$5) RETURNING id', [randomBytes(16).toString('hex'), AUTH0_ISSUER, BOOTSTRAP_OIDC_SUBJECT, BOOTSTRAP_EMAIL, BOOTSTRAP_NAME]);
    await client.query('INSERT INTO workspaces (id,name,slug) VALUES ($1,$2,$3)', [BOOTSTRAP_WORKSPACE_ID, BOOTSTRAP_WORKSPACE_NAME, BOOTSTRAP_WORKSPACE_SLUG]);
    await client.query("INSERT INTO workspace_memberships (workspace_id,user_id,role) VALUES ($1,$2,'admin')", [BOOTSTRAP_WORKSPACE_ID, user.rows[0].id]);
    await client.query('COMMIT');
    console.log('Initial workspace administrator created.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
} catch (error) {
  console.error(`Bootstrap failed: ${error.message}`);
  process.exitCode = 1;
} finally { await pool.end(); }
