import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

const testEnv = {
  NODE_ENV: 'test',
  AUTH0_ISSUER: 'https://issuer.test.invalid/',
  AUTH0_CLIENT_ID: 'test-client',
  AUTH0_CLIENT_SECRET: 'test-client-secret',
  APP_BASE_URL: 'http://localhost:3000',
  SESSION_SECRET: 'test-only-session-secret-with-32-bytes'
};

const testOidc = {
  async discovery() { return {}; },
  randomPKCECodeVerifier() { throw new Error('OIDC flow was not expected in API tests'); },
  async calculatePKCECodeChallenge() { throw new Error('OIDC flow was not expected in API tests'); },
  buildAuthorizationUrl() { throw new Error('OIDC flow was not expected in API tests'); },
  async authorizationCodeGrant() { throw new Error('OIDC flow was not expected in API tests'); }
};

function makePool({ userId = 'user-1', memberships = [], missions = [], failEventInsert = false } = {}) {
  const pool = {
    memberships,
    missions: structuredClone(missions),
    events: [],
    statements: [],
    userId,
    failEventInsert,
    snapshot: null,
    async query(sql, values = []) { return this.run(sql, values); },
    async connect() {
      return {
        query: async (sql, values = []) => pool.run(sql, values),
        release: () => { pool.released = true; }
      };
    },
    async run(sql, values = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      this.statements.push(normalized);
      if (normalized.startsWith('SELECT u.id AS user_id')) {
        return { rowCount: this.userId ? 1 : 0, rows: this.userId ? [{ user_id: this.userId, email: 'test@example.invalid', display_name: 'Test User' }] : [] };
      }
      if (normalized.startsWith('DELETE FROM sessions WHERE id_hash=$1')) {
        this.revokedSessionHash = values[0];
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('SELECT role FROM workspace_memberships')) {
        const membership = this.memberships.find((item) => item.workspace_id === values[0] && item.user_id === values[1]);
        return { rowCount: membership ? 1 : 0, rows: membership ? [{ role: membership.role }] : [] };
      }
      if (normalized === 'BEGIN') {
        this.snapshot = { missions: structuredClone(this.missions), events: structuredClone(this.events) };
        return { rowCount: null, rows: [] };
      }
      if (normalized === 'ROLLBACK') {
        if (this.snapshot) {
          this.missions = this.snapshot.missions;
          this.events = this.snapshot.events;
          this.snapshot = null;
        }
        return { rowCount: null, rows: [] };
      }
      if (normalized === 'COMMIT') {
        this.snapshot = null;
        return { rowCount: null, rows: [] };
      }
      if (normalized.startsWith('SELECT id,title,domain,status,progress,owner_id,created_at,updated_at FROM missions')) {
        let rows = this.missions.filter((mission) => mission.workspace_id === values[0]);
        const where = normalized.split(' ORDER BY ')[0];
        if (where.includes('status=$2')) rows = rows.filter((mission) => mission.status === values[1]);
        if (where.includes('id>$')) rows = rows.filter((mission) => mission.id > values[where.includes('status=$2') ? 2 : 1]);
        const limit = values.at(-1);
        return { rowCount: Math.min(rows.length, limit), rows: rows.sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit) };
      }
      if (normalized.startsWith('SELECT * FROM missions WHERE id=$1 AND workspace_id=$2 FOR UPDATE')) {
        const mission = this.missions.find((item) => item.id === values[0] && item.workspace_id === values[1]);
        return { rowCount: mission ? 1 : 0, rows: mission ? [structuredClone(mission)] : [] };
      }
      if (normalized.startsWith('INSERT INTO missions')) {
        const mission = { id: values[0], workspace_id: values[1], title: values[2], domain: values[3], status: 'planned', progress: 0, owner_id: values[4] };
        this.missions.push(mission);
        return { rowCount: 1, rows: [mission] };
      }
      if (normalized.startsWith('UPDATE missions SET')) {
        const mission = this.missions.find((item) => item.id === values[5] && item.workspace_id === values[6]);
        if (!mission) return { rowCount: 0, rows: [] };
        Object.assign(mission, { title: values[0], domain: values[1], status: values[2], progress: values[3], owner_id: values[4] });
        return { rowCount: 1, rows: [mission] };
      }
      if (normalized.startsWith('INSERT INTO events')) {
        if (this.failEventInsert) throw new Error('simulated event insert failure');
        const event = { id: values[0], workspace_id: values[1], event_type: values[2], actor_id: values[3], payload_json: values[4] };
        this.events.push(event);
        return { rowCount: 1, rows: [event] };
      }
      if (normalized === 'SELECT 1') return { rowCount: 1, rows: [{ '?column?': 1 }] };
      throw new Error(`Unimplemented simulated query: ${normalized}`);
    }
  };
  return pool;
}

async function makeAuthedApp(pool) {
  return buildApp({ env: testEnv, pool, oidcClient: testOidc });
}

const authHeaders = { cookie: 'xcloud_session=test-session', origin: testEnv.APP_BASE_URL };
const mission = (id, workspace_id) => ({ id, workspace_id, title: id, domain: 'test', status: 'planned', progress: 0, owner_id: 'user-1' });

test('missing OIDC config leaves service not ready and API inaccessible', async () => {
  const app = await buildApp({ env: { NODE_ENV: 'test' } });
  try {
    assert.equal((await app.inject('/')).statusCode, 200);
    assert.match((await app.inject('/')).headers['content-type'], /text\/html/);
    assert.match((await app.inject('/')).headers['content-security-policy'], /connect-src 'self'/);
    assert.equal((await app.inject('/manifest.webmanifest')).statusCode, 200);
    assert.equal((await app.inject('/service-worker.js')).headers['service-worker-allowed'], '/');
    assert.equal((await app.inject('/health')).statusCode, 503);
    assert.equal((await app.inject('/api/v1/workspaces/acme/missions')).statusCode, 503);
    const login = await app.inject('/auth/login');
    assert.equal(login.statusCode, 302);
    assert.equal(login.headers.location, '/account.html?login=unavailable');
  } finally { await app.close(); }
});

test('API rejects anonymous requests even when test database and OIDC are injected', async () => {
  const pool = makePool();
  const app = await makeAuthedApp(pool);
  try {
    const response = await app.inject('/api/v1/workspaces/acme/missions');
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error, 'authentication_required');
  } finally { await app.close(); }
});

test('session endpoint exposes only the authenticated identity and rejects anonymous callers', async () => {
  const pool = makePool();
  const app = await makeAuthedApp(pool);
  try {
    const anonymous = await app.inject('/api/v1/session');
    assert.equal(anonymous.statusCode, 401);
    assert.deepEqual(anonymous.json(), { error: 'authentication_required' });

    const authenticated = await app.inject({ url: '/api/v1/session', headers: authHeaders });
    assert.equal(authenticated.statusCode, 200);
    assert.deepEqual(authenticated.json(), {
      authenticated: true,
      user: { id: 'user-1', email: 'test@example.invalid', display_name: 'Test User' }
    });
    assert.equal(JSON.stringify(authenticated.json()).includes('test-session'), false);
    assert.ok(pool.statements.some((sql) => sql.includes('s.expires_at > now()')));
  } finally { await app.close(); }
});

test('session endpoint rejects a revoked or unknown session cookie', async () => {
  const app = await makeAuthedApp(makePool({ userId: null }));
  try {
    const response = await app.inject({ url: '/api/v1/session', headers: authHeaders });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: 'authentication_required' });
  } finally { await app.close(); }
});

test('logout rejects cross-origin requests and revokes the session on same-origin requests', async () => {
  const pool = makePool();
  const app = await makeAuthedApp(pool);
  try {
    const rejected = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: 'xcloud_session=test-session', origin: 'https://attacker.example' } });
    assert.equal(rejected.statusCode, 403);
    assert.equal(pool.revokedSessionHash, undefined);

    const response = await app.inject({ method: 'POST', url: '/auth/logout', headers: authHeaders });
    assert.equal(response.statusCode, 204);
    assert.match(response.headers['set-cookie'], /Max-Age=0/);
    assert.equal(typeof pool.revokedSessionHash, 'string');
    assert.equal(pool.revokedSessionHash.length, 64);
  } finally { await app.close(); }
});

test('API applies workspace roles to mission operations', async () => {
  const pool = makePool({ memberships: [
    { workspace_id: 'acme', user_id: 'user-1', role: 'viewer' },
    { workspace_id: 'bravo', user_id: 'user-1', role: 'member' },
    { workspace_id: 'charlie', user_id: 'user-1', role: 'manager' }
  ] });
  const app = await makeAuthedApp(pool);
  try {
    const denied = await app.inject({ method: 'POST', url: '/api/v1/workspaces/acme/missions', headers: authHeaders, payload: { title: 'Mission', domain: 'ops' } });
    const memberCreated = await app.inject({ method: 'POST', url: '/api/v1/workspaces/bravo/missions', headers: authHeaders, payload: { title: 'Mission', domain: 'ops' } });
    const managerCreated = await app.inject({ method: 'POST', url: '/api/v1/workspaces/charlie/missions', headers: authHeaders, payload: { title: 'Mission', domain: 'ops', owner_id: 'user-1' } });
    assert.equal(denied.statusCode, 403);
    assert.equal(memberCreated.statusCode, 201);
    assert.equal(managerCreated.statusCode, 201);
  } finally { await app.close(); }
});

test('workspace membership and SQL scope prevent cross-workspace reads and IDOR updates', async () => {
  const pool = makePool({
    memberships: [{ workspace_id: 'acme', user_id: 'user-1', role: 'manager' }],
    missions: [mission('mission-a', 'acme'), mission('mission-b', 'bravo')]
  });
  const app = await makeAuthedApp(pool);
  try {
    const ownList = await app.inject({ url: '/api/v1/workspaces/acme/missions', headers: authHeaders });
    const otherList = await app.inject({ url: '/api/v1/workspaces/bravo/missions', headers: authHeaders });
    const foreignId = await app.inject({ method: 'PATCH', url: '/api/v1/workspaces/acme/missions/mission-b', headers: authHeaders, payload: { title: 'stolen' } });
    assert.deepEqual(ownList.json().data.map((item) => item.id), ['mission-a']);
    assert.equal(otherList.statusCode, 404);
    assert.equal(foreignId.statusCode, 404);
    assert.equal(pool.missions.find((item) => item.id === 'mission-b').title, 'mission-b');
  } finally { await app.close(); }
});

test('API validates invalid mission input before database writes', async () => {
  const pool = makePool({ memberships: [{ workspace_id: 'acme', user_id: 'user-1', role: 'manager' }] });
  const app = await makeAuthedApp(pool);
  try {
    const response = await app.inject({ method: 'PATCH', url: '/api/v1/workspaces/acme/missions/m1', headers: authHeaders, payload: { owner_id: '' } });
    assert.equal(response.statusCode, 400);
    assert.equal(pool.statements.some((sql) => sql.startsWith('BEGIN')), false);
  } finally { await app.close(); }
});

test('mission and audit event roll back together when event insertion fails', async () => {
  const pool = makePool({
    memberships: [{ workspace_id: 'acme', user_id: 'user-1', role: 'member' }],
    missions: [mission('m1', 'acme')],
    failEventInsert: true
  });
  const app = await makeAuthedApp(pool);
  try {
    const response = await app.inject({ method: 'PATCH', url: '/api/v1/workspaces/acme/missions/m1', headers: authHeaders, payload: { title: 'changed' } });
    assert.equal(response.statusCode, 500);
    assert.equal(pool.missions[0].title, 'm1');
    assert.equal(pool.events.length, 0);
    assert.ok(pool.statements.includes('ROLLBACK'));
    assert.equal(pool.released, true);
  } finally { await app.close(); }
});

test('Organism requires a configured provider and workspace AI permission', async () => {
  const pool = makePool({ memberships: [
    { workspace_id: 'team', user_id: 'user-1', role: 'viewer' },
    { workspace_id: 'writers', user_id: 'user-1', role: 'member' }
  ] });
  let providerCalls = 0;
  const app = await buildApp({
    env: { ...testEnv, ORGANISM_API_BASE_URL: 'https://model.example/v1', ORGANISM_MODEL: 'organism-test', ORGANISM_API_KEY: 'test-secret' },
    pool,
    oidcClient: testOidc,
    organismFetch: async (url, options) => {
      providerCalls++;
      assert.equal(url, 'https://model.example/v1/chat/completions');
      assert.equal(options.headers.authorization, 'Bearer test-secret');
      const payload = JSON.parse(options.body);
      assert.equal(payload.model, 'organism-test');
      assert.equal(payload.messages.at(-1).content, 'Scrivi un riepilogo');
      return new Response(JSON.stringify({ model: 'organism-test', choices: [{ message: { content: 'Risposta generata.' } }], usage: { total_tokens: 18 } }), { status: 200 });
    }
  });
  try {
    const denied = await app.inject({ method: 'POST', url: '/api/v1/workspaces/team/organism/generate', headers: authHeaders, payload: { prompt: 'Non autorizzato' } });
    const generated = await app.inject({ method: 'POST', url: '/api/v1/workspaces/writers/organism/generate', headers: authHeaders, payload: { prompt: 'Scrivi un riepilogo' } });
    assert.equal(denied.statusCode, 403);
    assert.equal(generated.statusCode, 200);
    assert.equal(generated.json().provider, 'OpenAI-compatible endpoint');
    assert.equal(generated.json().output, 'Risposta generata.');
    assert.equal(generated.json().usage.total_tokens, 18);
    assert.equal(providerCalls, 1);
  } finally { await app.close(); }
});

test('Organism rejects oversized prompts and reports an unconfigured provider without calling it', async () => {
  const pool = makePool({ memberships: [{ workspace_id: 'writers', user_id: 'user-1', role: 'member' }] });
  let providerCalls = 0;
  const app = await buildApp({ env: testEnv, pool, oidcClient: testOidc, organismFetch: async () => { providerCalls++; } });
  try {
    const unavailable = await app.inject({ method: 'POST', url: '/api/v1/workspaces/writers/organism/generate', headers: authHeaders, payload: { prompt: 'richiesta' } });
    const oversized = await app.inject({ method: 'POST', url: '/api/v1/workspaces/writers/organism/generate', headers: authHeaders, payload: { prompt: 'x'.repeat(6001) } });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.json().error, 'organism_not_configured');
    assert.equal(oversized.statusCode, 400);
    assert.equal(providerCalls, 0);
  } finally { await app.close(); }
});
