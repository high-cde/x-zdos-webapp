import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
import { can, assertTransition } from '../src/authorization.js';
import { CHAIN_CONFIG } from '../config/chain.config.js';
import { recordOnChain } from '../services/chainAdapter.js';

test('production refuses startup without database and OIDC configuration', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /Production startup denied/);
});

test('role permissions follow the MVP policy', () => {
  assert.equal(can('viewer', 'mission:read'), true);
  assert.equal(can('viewer', 'mission:write'), false);
  assert.equal(can('member', 'event:write'), true);
  assert.equal(can('manager', 'membership:manage'), false);
  assert.equal(can('admin', 'workspace:manage'), false);
  assert.equal(can('unknown', 'mission:read'), false);
});

test('mission transitions enforce terminal completion progress', () => {
  assert.doesNotThrow(() => assertTransition('active', 'completed', 100));
  assert.throws(() => assertTransition('active', 'completed', 90), /progress 100/);
  assert.throws(() => assertTransition('completed', 'active', 100), /Invalid mission status/);
});

test('chain adapter remains explicitly disabled and does not fabricate a transaction', async () => {
  assert.equal(CHAIN_CONFIG.enabled, false);
  assert.deepEqual(await recordOnChain('example', { sample: true }), { status: 'disabled', configured: false });
});
