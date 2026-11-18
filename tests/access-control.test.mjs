import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAccessControl } from '../server/access-control.mjs';

test('only loopback development/test environments bypass login', () => {
  for (const host of ['127.0.0.1', 'localhost', '::1']) {
    const access = createAccessControl({ host, environment: 'development' });
    assert.equal(access.required, false);
    assert.equal(access.authorize(undefined), true);
  }
  for (const options of [
    { environment: 'production' }, { environment: 'staging' },
    { host: '0.0.0.0' }, { host: '::' }, { host: '192.168.1.20' },
    { publicOrigin: 'https://public.example.test' },
  ]) {
    assert.throws(() => createAccessControl(options), { code: 'POC_AUTH_CONFIG' });
  }
});

test('required credentials are validated and Unicode Basic credentials remain usable', () => {
  for (const credentials of [
    { username: 'poc', password: 'short' },
    { username: 'poc:name', password: 'test-password-only' },
    { username: '', password: 'test-password-only' },
  ]) {
    assert.throws(() => createAccessControl({ environment: 'production', ...credentials }), { code: 'POC_AUTH_CONFIG' });
  }
  const access = createAccessControl({
    environment: 'production', username: 'מנהל', password: 'test:password:only',
  });
  const basic = credentials => `Basic ${Buffer.from(credentials).toString('base64')}`;
  assert.equal(access.authorize(basic('מנהל:test:password:only')), true);
  assert.equal(access.authorize(basic('מנהל:wrong-password')), false);
  assert.equal(access.authorize(basic('other:test:password:only')), false);
  assert.equal(access.authorize('Basic invalid'), false);
});

test('public origin validation rejects credentials, paths and unsupported schemes', () => {
  for (const publicOrigin of ['invalid', 'file:///tmp/poc', 'https://user:password@example.test',
    'https://example.test/path', 'https://example.test/?query=1', 'https://example.test/#hash']) {
    assert.throws(() => createAccessControl({ publicOrigin }), { code: 'PUBLIC_ORIGIN_INVALID' });
  }
});

test('the production entrypoint exits before listening when access credentials are missing', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../server/main.mjs', import.meta.url))], {
    encoding: 'utf8', timeout: 5000,
    env: {
      ...process.env, HOST: '127.0.0.1', PORT: '3000', NODE_ENV: 'production',
      POC_AUTH_USER: '', POC_AUTH_PASSWORD: '', PUBLIC_ORIGIN: '', RENDER_EXTERNAL_URL: '',
    },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /POC_AUTH_CONFIG/);
  assert.doesNotMatch(result.stdout, /YGO hotel POC:/);
});
