import Fastify from 'fastify';
import { randomBytes, createHmac } from 'node:crypto';
import * as oidc from 'openid-client';
import { readConfig } from './config.js';
import { can, assertTransition } from './authorization.js';

const cookieName = 'xcloud_session';
const statuses = ['planned', 'active', 'blocked', 'completed', 'cancelled'];

function sessionCookie(config, id, maxAge) {
  return `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax${config.production ? '; Secure' : ''}; Max-Age=${maxAge}`;
}
function hashToken(config, token) {
  return createHmac('sha256', config.auth0.sessionSecret).update(token).digest('hex');
}
async function rollbackQuietly(client) {
  try { await client.query('ROLLBACK'); } catch { /* Preserve the operation error. */ }
}

export async function buildApp({ env = process.env, pool: injectedPool, oidcClient = oidc } = {}) {
  const config = readConfig(env);
  let pool = injectedPool;
  if (!pool && config.databaseUrl) {
    const { Pool } = await import('pg');
    pool = new Pool({ connectionString: config.databaseUrl, ssl: config.production ? { rejectUnauthorized: true } : undefined });
  }
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  let oidcConfig;
  if (config.authReady) oidcConfig = await oidcClient.discovery(new URL(config.auth0.issuer), config.auth0.clientId, config.auth0.clientSecret);

  app.addHook('onRequest', async (request) => {
    request.identity = null;
    const raw = request.headers.cookie?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!raw || !pool || !config.authReady) return;
    const result = await pool.query(
      `SELECT u.id AS user_id, u.email, u.display_name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id_hash = $1 AND s.expires_at > now()`,
      [hashToken(config, raw)]
    );
    if (result.rowCount) request.identity = { ...result.rows[0] };
  });

  app.get('/health', async (_req, reply) => {
    const ready = Boolean(pool && config.authReady);
    if (!ready) return reply.code(503).send({ status: 'not_ready', database: Boolean(pool), oidc: config.authReady });
    try { await pool.query('SELECT 1'); }
    catch { return reply.code(503).send({ status: 'not_ready', database: false, oidc: true }); }
    return { status: 'ok' };
  });

  app.get('/auth/login', async (_req, reply) => {
    if (!config.authReady || !pool) return reply.code(503).send({ error: 'authentication_not_configured' });
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = oidcClient.randomPKCECodeVerifier();
    const challenge = await oidcClient.calculatePKCECodeChallenge(verifier);
    const id = randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO oidc_transactions (id_hash, state, nonce, code_verifier, expires_at) VALUES ($1,$2,$3,$4,now()+interval \'10 minutes\')', [hashToken(config, id), state, nonce, verifier]);
    const url = oidcClient.buildAuthorizationUrl(oidcConfig, { redirect_uri: `${config.auth0.baseUrl}/auth/callback`, scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' });
    return reply.header('set-cookie', sessionCookie({ ...config, production: config.production }, id, 600)).redirect(url.href);
  });

  app.get('/auth/callback', async (request, reply) => {
    if (!config.authReady || !pool) return reply.code(503).send({ error: 'authentication_not_configured' });
    const raw = request.headers.cookie?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!raw) return reply.code(400).send({ error: 'invalid_oidc_transaction' });
    const hash = hashToken(config, raw);
    const tx = await pool.query('DELETE FROM oidc_transactions WHERE id_hash=$1 AND expires_at>now() RETURNING state,nonce,code_verifier', [hash]);
    if (!tx.rowCount) return reply.code(400).send({ error: 'invalid_oidc_transaction' });
    let claims;
    try {
      const tokens = await oidcClient.authorizationCodeGrant(oidcConfig, new URL(request.url, config.auth0.baseUrl), { pkceCodeVerifier: tx.rows[0].code_verifier, expectedState: tx.rows[0].state, expectedNonce: tx.rows[0].nonce });
      claims = tokens.claims();
      if (!claims.sub || !claims.email) throw new Error('OIDC identity lacks required claims');
    } catch {
      return reply.code(401).send({ error: 'oidc_authentication_failed' });
    }
    if (claims.email_verified !== true) return reply.code(403).send({ error: 'verified_email_required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query('INSERT INTO users (id, oidc_issuer, oidc_subject, email, display_name) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (oidc_issuer,oidc_subject) DO UPDATE SET email=excluded.email, display_name=excluded.display_name RETURNING id', [randomBytes(16).toString('hex'), config.auth0.issuer, claims.sub, claims.email, claims.name || claims.email]);
      const memberships = await client.query('SELECT 1 FROM workspace_memberships WHERE user_id=$1 LIMIT 1', [user.rows[0].id]);
      if (!memberships.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'workspace_invitation_required' });
      }
      const sessionId = randomBytes(32).toString('base64url');
      await client.query('INSERT INTO sessions (id_hash,user_id,expires_at) VALUES ($1,$2,now()+interval \'8 hours\')', [hashToken(config, sessionId), user.rows[0].id]);
      await client.query('COMMIT');
      return reply.header('set-cookie', sessionCookie(config, sessionId, 28800)).redirect('/');
    } catch (error) { await rollbackQuietly(client); throw error; }
    finally { client.release(); }
  });

  app.post('/auth/logout', async (request, reply) => {
    if (config.authReady && request.headers.origin !== config.auth0.baseUrl) return reply.code(403).send({ error: 'invalid_origin' });
    const raw = request.headers.cookie?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (raw && pool && config.authReady) await pool.query('DELETE FROM sessions WHERE id_hash=$1', [hashToken(config, raw)]);
    return reply.header('set-cookie', sessionCookie(config, '', 0)).code(204).send();
  });

  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/auth/') || request.url === '/health') return;
    if (!pool || !config.authReady) return reply.code(503).send({ error: 'service_not_ready' });
    if (!request.identity) return reply.code(401).send({ error: 'authentication_required' });
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) && request.headers.origin !== config.auth0.baseUrl) return reply.code(403).send({ error: 'invalid_origin' });
  });

  const workspaceAccess = (permission) => async (request, reply) => {
    const membership = await pool.query('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2', [request.params.workspaceId, request.identity.user_id]);
    if (!membership.rowCount) return reply.code(404).send({ error: 'not_found' });
    request.identity.role = membership.rows[0].role;
    if (!can(request.identity.role, permission)) return reply.code(403).send({ error: 'forbidden' });
  };
  const workspaceParams = { type: 'object', required: ['workspaceId'], properties: { workspaceId: { type: 'string', minLength: 1, maxLength: 100 } } };
  app.get('/api/v1/workspaces/:workspaceId/missions', { schema: { params: workspaceParams, querystring: { type: 'object', properties: { status: { type: 'string', enum: statuses }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }, cursor: { type: 'string' } } } }, preHandler: workspaceAccess('mission:read') }, async (request) => {
    const { status, limit = 50, cursor } = request.query;
    const values = [request.params.workspaceId];
    let where = 'workspace_id=$1';
    if (status) { values.push(status); where += ` AND status=$${values.length}`; }
    if (cursor) { values.push(cursor); where += ` AND id>$${values.length}`; }
    values.push(limit + 1);
    const result = await pool.query(`SELECT id,title,domain,status,progress,owner_id,created_at,updated_at FROM missions WHERE ${where} ORDER BY id LIMIT $${values.length}`, values);
    const hasMore = result.rows.length > limit;
    const missions = result.rows.slice(0, limit);
    return { data: missions, next_cursor: hasMore ? missions.at(-1).id : null };
  });
  app.post('/api/v1/workspaces/:workspaceId/missions', { schema: { params: workspaceParams, body: { type: 'object', additionalProperties: false, required: ['title','domain'], properties: { title: { type: 'string', minLength: 1, maxLength: 240 }, domain: { type: 'string', minLength: 1, maxLength: 100 }, owner_id: { type: 'string', minLength: 1, maxLength: 100 } } } }, preHandler: workspaceAccess('mission:write') }, async (request, reply) => {
    if (request.body.owner_id && !can(request.identity.role, 'mission:manage')) return reply.code(403).send({ error: 'forbidden' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = randomBytes(16).toString('hex');
      const mission = await client.query("INSERT INTO missions (id,workspace_id,title,domain,status,progress,owner_id) VALUES ($1,$2,$3,$4,'planned',0,$5) RETURNING *", [id, request.params.workspaceId, request.body.title, request.body.domain, request.body.owner_id || request.identity.user_id]);
      await client.query('INSERT INTO events (id,workspace_id,event_type,actor_id,payload_json) VALUES ($1,$2,$3,$4,$5)', [randomBytes(16).toString('hex'), request.params.workspaceId, 'mission.created', request.identity.user_id, JSON.stringify({ mission_id: id, title: request.body.title, domain: request.body.domain })]);
      await client.query('COMMIT');
      return reply.code(201).send(mission.rows[0]);
    } catch (error) { await rollbackQuietly(client); throw error; }
    finally { client.release(); }
  });
  app.patch('/api/v1/workspaces/:workspaceId/missions/:missionId', { schema: { params: { type: 'object', required: ['workspaceId','missionId'], properties: { ...workspaceParams.properties, missionId: { type: 'string', minLength: 1, maxLength: 100 } } }, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: { title: { type: 'string', minLength: 1, maxLength: 240 }, domain: { type: 'string', minLength: 1, maxLength: 100 }, status: { type: 'string', enum: statuses }, progress: { type: 'integer', minimum: 0, maximum: 100 }, owner_id: { type: 'string', minLength: 1, maxLength: 100 } } } }, preHandler: workspaceAccess('mission:write') }, async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query('SELECT * FROM missions WHERE id=$1 AND workspace_id=$2 FOR UPDATE', [request.params.missionId, request.params.workspaceId]);
      if (!prior.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const old = prior.rows[0], patch = request.body;
      const nextStatus = patch.status ?? old.status, nextProgress = patch.progress ?? old.progress;
      if (patch.status && patch.status !== old.status) {
        if (!can(request.identity.role, 'mission:manage') && patch.status !== 'active') {
          await client.query('ROLLBACK');
          return reply.code(403).send({ error: 'forbidden' });
        }
        assertTransition(old.status, nextStatus, nextProgress);
      }
      if ((patch.owner_id || patch.status === 'cancelled') && !can(request.identity.role, 'mission:manage')) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (nextStatus === 'completed' && nextProgress !== 100) throw Object.assign(new Error('Completed missions must have progress 100'), { statusCode: 422 });
      const updated = await client.query('UPDATE missions SET title=$1,domain=$2,status=$3,progress=$4,owner_id=$5,updated_at=now() WHERE id=$6 AND workspace_id=$7 RETURNING *', [patch.title ?? old.title, patch.domain ?? old.domain, nextStatus, nextProgress, patch.owner_id ?? old.owner_id, old.id, old.workspace_id]);
      await client.query('INSERT INTO events (id,workspace_id,event_type,actor_id,payload_json) VALUES ($1,$2,$3,$4,$5)', [randomBytes(16).toString('hex'), old.workspace_id, patch.status && patch.status !== old.status ? 'mission.status_changed' : 'mission.updated', request.identity.user_id, JSON.stringify({ mission_id: old.id, changes: patch })]);
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) { await rollbackQuietly(client); throw error; }
    finally { client.release(); }
  });
  app.post('/api/v1/workspaces/:workspaceId/events', { schema: { params: workspaceParams, body: { type: 'object', additionalProperties: false, required: ['event_type'], properties: { event_type: { type: 'string', minLength: 1, maxLength: 100 }, payload: { type: 'object' } } } }, preHandler: workspaceAccess('event:write') }, async (request, reply) => {
    const result = await pool.query('INSERT INTO events (id,workspace_id,event_type,actor_id,payload_json) VALUES ($1,$2,$3,$4,$5) RETURNING id,workspace_id,event_type,actor_id,payload_json,created_at', [randomBytes(16).toString('hex'), request.params.workspaceId, request.body.event_type, request.identity.user_id, JSON.stringify(request.body.payload || {})]);
    return reply.code(201).send(result.rows[0]);
  });
  app.addHook('onClose', async () => { if (pool && !injectedPool) await pool.end(); });
  return app;
}
