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
  assert.equal(can('member', 'ai:generate'), true);
  assert.equal(can('viewer', 'ai:generate'), false);
  assert.equal(can('manager', 'membership:manage'), false);
  assert.equal(can('admin', 'workspace:manage'), false);
  assert.equal(can('unknown', 'mission:read'), false);
});

test('Organism provider URL requires a secure, clean endpoint', () => {
  assert.equal(readConfig({ NODE_ENV: 'development', ORGANISM_API_BASE_URL: 'http://127.0.0.1:11434/v1', ORGANISM_MODEL: 'local-model' }).organism.model, 'local-model');
  assert.throws(() => readConfig({ NODE_ENV: 'production', ORGANISM_API_BASE_URL: 'http://model.example/v1', ORGANISM_MODEL: 'model' }), /must use HTTPS/);
  assert.throws(() => readConfig({ NODE_ENV: 'development', ORGANISM_API_BASE_URL: 'https://user:pass@model.example/v1', ORGANISM_MODEL: 'model' }), /must not contain credentials/);
});

test('OIDC permits plain HTTP only for loopback development issuers', () => {
  const oidc = {
    AUTH0_ISSUER: 'http://localhost:8080/realms/zdos-dev',
    AUTH0_CLIENT_ID: 'xzdos-local',
    AUTH0_CLIENT_SECRET: 'local-only-secret',
    APP_BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'local-development-session-secret-over-32-characters'
  };
  assert.equal(readConfig({ NODE_ENV: 'development', ...oidc }).authReady, true);
  assert.equal(readConfig({ NODE_ENV: 'development', ...oidc, AUTH0_ISSUER: 'http://idp.example.test/realm' }).authReady, false);
  assert.equal(readConfig({ NODE_ENV: 'development', ...oidc, APP_BASE_URL: 'http://app.example.test' }).authReady, false);
  assert.throws(() => readConfig({ NODE_ENV: 'production', ...oidc }), /Production startup denied/);
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
