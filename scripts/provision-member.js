import { randomBytes } from 'node:crypto';
import pg from 'pg';

const { DATABASE_URL, AUTH0_ISSUER, MEMBER_OIDC_SUBJECT, MEMBER_EMAIL, MEMBER_NAME, MEMBER_WORKSPACE_ID } = process.env;
const role = process.env.MEMBER_ROLE || 'viewer';
if (![DATABASE_URL, AUTH0_ISSUER, MEMBER_OIDC_SUBJECT, MEMBER_EMAIL, MEMBER_NAME, MEMBER_WORKSPACE_ID].every(Boolean) || !['viewer', 'member', 'manager', 'admin'].includes(role)) {
  console.error('Provisioning requires DB/OIDC issuer, member identity, workspace, and an allowed MEMBER_ROLE.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query('INSERT INTO users (id,oidc_issuer,oidc_subject,email,display_name) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (oidc_issuer,oidc_subject) DO UPDATE SET email=excluded.email, display_name=excluded.display_name RETURNING id', [randomBytes(16).toString('hex'), AUTH0_ISSUER, MEMBER_OIDC_SUBJECT, MEMBER_EMAIL, MEMBER_NAME]);
    const membership = await client.query('INSERT INTO workspace_memberships (workspace_id,user_id,role) SELECT id,$2,$3 FROM workspaces WHERE id=$1 ON CONFLICT (workspace_id,user_id) DO NOTHING RETURNING workspace_id', [MEMBER_WORKSPACE_ID, user.rows[0].id, role]);
    if (!membership.rowCount) throw new Error('Workspace does not exist or membership already exists');
    await client.query('COMMIT');
    console.log(`Provisioned member with role ${role}.`);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
} catch (error) {
  console.error(`Member provisioning failed: ${error.message}`);
  process.exitCode = 1;
} finally { await pool.end(); }
