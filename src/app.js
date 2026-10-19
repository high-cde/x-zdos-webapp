import Fastify from 'fastify';
import { randomBytes, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as oidc from 'openid-client';
import { readConfig } from './config.js';
import { can, assertTransition } from './authorization.js';
import { generateWithOrganism } from '../services/organism.js';

const cookieName = 'xcloud_session';
const statuses = ['planned', 'active', 'blocked', 'completed', 'cancelled'];
const publicAssets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ...['index.html', 'lab.html', 'lab-ide.html', 'specs.html', 'wallet.html', 'xcloud.html', 'velvet.html', 'offline.html', 'admin.html', 'enet.html', 'account.html', 'downloads.html'].map((name) => [`/${name}`, [name, 'text/html; charset=utf-8']]),
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/service-worker.js', ['service-worker.js', 'text/javascript; charset=utf-8']],
  ['/offline-app.js', ['offline-app.js', 'text/javascript; charset=utf-8']],
  ['/wallet-miner.js', ['wallet-miner.js', 'text/javascript; charset=utf-8']],
  ['/dsn-miner.js', ['dsn-miner.js', 'text/javascript; charset=utf-8']],
  ['/devhub24-80.png', ['devhub24-80.png', 'image/png']],
  ['/b24devhub-header.png', ['b24devhub-header.png', 'image/png']]
]);

function sessionCookie(config, id, maxAge) {
  return `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax${config.production ? '; Secure' : ''}; Max-Age=${maxAge}`;
}
function hashToken(config, token) {
  return createHmac('sha256', config.auth0.sessionSecret).update(token).digest('hex');
}
async function rollbackQuietly(client) {
  try { await client.query('ROLLBACK'); } catch { /* Preserve the operation error. */ }
}

export async function buildApp({ env = process.env, pool: injectedPool, oidcClient = oidc, organismFetch = fetch } = {}) {
  const config = readConfig(env);
  let pool = injectedPool;
  if (!pool && config.databaseUrl) {
    const { Pool } = await import('pg');
    pool = new Pool({ connectionString: config.databaseUrl, ssl: config.production ? { rejectUnauthorized: true } : undefined });
  }
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    return payload;
  });
  for (const [url, [filename, contentType]] of publicAssets) {
    app.get(url, { config: { public: true } }, async (_request, reply) => {
      const body = await readFile(new URL(`../${filename}`, import.meta.url));
      reply.type(contentType).header('cache-control', 'no-cache');
      if (filename === 'service-worker.js') reply.header('service-worker-allowed', '/');
      return reply.send(body);
    });
  }
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

  app.get('/api/v1/session', async (request, reply) => {
    if (!request.identity) return reply.code(401).send({ error: 'authentication_required' });
    return {
      authenticated: true,
      user: {
        id: request.identity.user_id,
        email: request.identity.email,
        display_name: request.identity.display_name
      }
    };
  });

  app.get('/api/v1/organism/status', async () => ({
    status: config.organism ? 'configured' : 'not_configured',
    model: config.organism?.model || null,
    protocol: config.organism ? 'openai-compatible-chat-completions' : null
  }));

  app.get('/auth/registration-status', { config: { public: true } }, async () => {
    if (!pool || !config.authReady || !config.selfServiceSignup) return { enabled: false };
    try { await pool.query('SELECT 1'); return { enabled: true }; }
    catch { return { enabled: false }; }
  });

  const beginOidc = async (request, reply, signup = false) => {
    if (!config.authReady || !pool) return reply.code(503).send({ error: 'authentication_not_configured' });
    if (signup && !config.selfServiceSignup) return reply.code(503).send({ error: 'self_service_registration_disabled' });
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = oidcClient.randomPKCECodeVerifier();
    const challenge = await oidcClient.calculatePKCECodeChallenge(verifier);
    const id = randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO oidc_transactions (id_hash, state, nonce, code_verifier, is_signup, expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval \'10 minutes\')', [hashToken(config, id), state, nonce, verifier, signup]);
    const params = { redirect_uri: `${config.auth0.baseUrl}/auth/callback`, scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' };
    if (signup) params.screen_hint = 'signup';
    const url = oidcClient.buildAuthorizationUrl(oidcConfig, params);
    return reply.header('set-cookie', sessionCookie({ ...config, production: config.production }, id, 600)).redirect(url.href);
  };
  app.get('/auth/login', async (request, reply) => {
    if (!config.authReady || !pool) return reply.redirect('/account.html?login=unavailable');
    return beginOidc(request, reply);
  });
  app.get('/auth/register', async (request, reply) => {
    if (!config.selfServiceSignup) return reply.redirect('/account.html?registration=disabled');
    if (!config.authReady || !pool) return reply.redirect('/account.html?registration=unavailable');
    return beginOidc(request, reply, true);
  });

  app.get('/auth/callback', async (request, reply) => {
    if (!config.authReady || !pool) return reply.code(503).send({ error: 'authentication_not_configured' });
    const raw = request.headers.cookie?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!raw) return reply.code(400).send({ error: 'invalid_oidc_transaction' });
    const hash = hashToken(config, raw);
    const tx = await pool.query('DELETE FROM oidc_transactions WHERE id_hash=$1 AND expires_at>now() RETURNING state,nonce,code_verifier,is_signup', [hash]);
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
    let createdWorkspaceId = null;
    try {
      await client.query('BEGIN');
      const user = await client.query('INSERT INTO users (id, oidc_issuer, oidc_subject, email, display_name) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (oidc_issuer,oidc_subject) DO UPDATE SET email=excluded.email, display_name=excluded.display_name RETURNING id', [randomBytes(16).toString('hex'), config.auth0.issuer, claims.sub, claims.email, claims.name || claims.email]);
      const memberships = await client.query('SELECT 1 FROM workspace_memberships WHERE user_id=$1 LIMIT 1', [user.rows[0].id]);
      if (!memberships.rowCount) {
        if (!tx.rows[0].is_signup || !config.selfServiceSignup) {
          await client.query('ROLLBACK');
          return reply.code(403).send({ error: 'workspace_invitation_required' });
        }
        const displayName = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : claims.email.split('@')[0];
        const baseSlug = displayName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'zdos-user';
        createdWorkspaceId = `ws-${randomBytes(12).toString('hex')}`;
        const workspaceName = displayName.slice(0, 120);
        await client.query('INSERT INTO workspaces (id,name,slug) VALUES ($1,$2,$3)', [createdWorkspaceId, workspaceName, `${baseSlug}-${randomBytes(3).toString('hex')}`]);
        await client.query("INSERT INTO workspace_memberships (workspace_id,user_id,role) VALUES ($1,$2,'admin')", [createdWorkspaceId, user.rows[0].id]);
      }
      const sessionId = randomBytes(32).toString('base64url');
      await client.query('INSERT INTO sessions (id_hash,user_id,expires_at) VALUES ($1,$2,now()+interval \'8 hours\')', [hashToken(config, sessionId), user.rows[0].id]);
      await client.query('COMMIT');
      return reply.header('set-cookie', sessionCookie(config, sessionId, 28800)).redirect(createdWorkspaceId ? `/admin.html?workspace=${encodeURIComponent(createdWorkspaceId)}` : '/');
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
    if (request.routeOptions.config.public) return;
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
  app.get('/api/v1/admin/workspaces', async (request) => {
    const result = await pool.query('SELECT w.id,w.name,w.slug FROM workspaces w JOIN workspace_memberships wm ON wm.workspace_id=w.id WHERE wm.user_id=$1 AND wm.role=$2 ORDER BY w.name LIMIT 100', [request.identity.user_id, 'admin']);
    return { data: result.rows };
  });
  app.get('/api/v1/admin/workspaces/:workspaceId/overview', { schema: { params: workspaceParams }, preHandler: workspaceAccess('workspace:admin') }, async (request, reply) => {
    const workspaceId = request.params.workspaceId;
    const [workspace, counts, members, events] = await Promise.all([
      pool.query('SELECT id,name,slug,created_at FROM workspaces WHERE id=$1', [workspaceId]),
      pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status='active')::int AS active, count(*) FILTER (WHERE status='blocked')::int AS blocked, count(*) FILTER (WHERE status='completed')::int AS completed FROM missions WHERE workspace_id=$1", [workspaceId]),
      pool.query('SELECT u.id,u.email,u.display_name,wm.role FROM workspace_memberships wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=$1 ORDER BY u.display_name LIMIT 100', [workspaceId]),
      pool.query('SELECT e.id,e.event_type,e.actor_id,e.payload_json,e.created_at,u.display_name FROM events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.workspace_id=$1 ORDER BY e.created_at DESC LIMIT 20', [workspaceId])
    ]);
    if (!workspace.rowCount) return reply.code(404).send({ error: 'not_found' });
    return { workspace: workspace.rows[0], missions: counts.rows[0], members: members.rows, events: events.rows };
  });
  app.patch('/api/v1/admin/workspaces/:workspaceId/members/:userId', {
    schema: {
      params: { type: 'object', required: ['workspaceId', 'userId'], properties: { ...workspaceParams.properties, userId: { type: 'string', minLength: 1, maxLength: 100 } } },
      body: { type: 'object', additionalProperties: false, required: ['role'], properties: { role: { type: 'string', enum: ['viewer', 'member', 'manager', 'admin'] } } }
    },
    preHandler: workspaceAccess('workspace:admin')
  }, async (request, reply) => {
    const { workspaceId, userId } = request.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspaceId]);
      const prior = await client.query('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE', [workspaceId, userId]);
      if (!prior.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const nextRole = request.body.role;
      if (prior.rows[0].role === 'admin' && nextRole !== 'admin') {
        const admins = await client.query("SELECT count(*)::int AS total FROM workspace_memberships WHERE workspace_id=$1 AND role='admin'", [workspaceId]);
        if (admins.rows[0].total <= 1) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'last_admin_required' }); }
      }
      if (prior.rows[0].role === nextRole) { await client.query('COMMIT'); return { workspace_id: workspaceId, user_id: userId, role: nextRole }; }
      await client.query('UPDATE workspace_memberships SET role=$1 WHERE workspace_id=$2 AND user_id=$3', [nextRole, workspaceId, userId]);
      await client.query('INSERT INTO events (id,workspace_id,event_type,actor_id,payload_json) VALUES ($1,$2,$3,$4,$5)', [randomBytes(16).toString('hex'), workspaceId, 'membership.role_changed', request.identity.user_id, JSON.stringify({ user_id: userId, previous_role: prior.rows[0].role, role: nextRole })]);
      await client.query('COMMIT');
      return { workspace_id: workspaceId, user_id: userId, role: nextRole };
    } catch (error) { await rollbackQuietly(client); throw error; }
    finally { client.release(); }
  });
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
  app.post('/api/v1/workspaces/:workspaceId/organism/generate', {
    schema: {
      params: workspaceParams,
      body: {
        type: 'object', additionalProperties: false, required: ['prompt'],
        properties: { prompt: { type: 'string', minLength: 1, maxLength: 6000 } }
      }
    },
    preHandler: workspaceAccess('ai:generate')
  }, async (request, reply) => {
    if (!config.organism) return reply.code(503).send({ error: 'organism_not_configured' });
    const prompt = request.body.prompt.trim();
    if (!prompt) return reply.code(400).send({ error: 'prompt_required' });
    try {
      const result = await generateWithOrganism({ config: config.organism, prompt, fetchImpl: organismFetch });
      return { provider: 'OpenAI-compatible endpoint', model: result.model, output: result.output, usage: result.usage };
    } catch (error) {
      if (error.code === 'organism_provider_timeout') return reply.code(504).send({ error: error.code });
      if (error.code === 'organism_not_configured') return reply.code(503).send({ error: error.code });
      return reply.code(502).send({ error: error.code || 'organism_provider_unavailable' });
    }
  });
  app.addHook('onClose', async () => { if (pool && !injectedPool) await pool.end(); });
  return app;
}

// Integrazione endpoint ZLang nativo
import { compileZLangSource } from './zlang/engine.js';
fastify.post('/api/zlang/compile', async (request, reply) => {
    try {
        const { code } = request.body || {};
        const result = compileZLangSource(code);
        return reply.send(result);
    } catch (err) {
        return reply.code(400).send({ error: err.message });
    }
});
