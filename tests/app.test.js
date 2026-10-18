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
    assert.equal((await app.inject('/health')).statusCode, 503);
    assert.equal((await app.inject('/api/v1/workspaces/acme/missions')).statusCode, 503);
    assert.equal((await app.inject('/auth/login')).statusCode, 503);
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
