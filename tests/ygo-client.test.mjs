import test from 'node:test';
import assert from 'node:assert/strict';
import { createYgoClient, retryDelay } from '../server/ygo-client.mjs';

test('content request uses only the external ProductID selector and server credentials', async () => {
  let sent;
  const client = createYgoClient({
    key: 'test-only-key', projectId: 'test-project',
    requestImpl: async request => {
      sent = request;
      return { status: 200, body: JSON.stringify({ Data: { ID: 'uuid' }, Error: null }) };
    },
  });
  assert.deepEqual(await client.getHotel('4458386'), { ID: 'uuid' });
  assert.deepEqual(sent.body, { ExternalHotelID: { productid: '4458386' } });
  assert.equal(sent.headers.Authorization, 'Bearer test-only-key');
  assert.equal(sent.headers['X-Project-ID'], 'test-project');
});

test('rate limiting waits once when bounded, otherwise propagates Retry-After', async () => {
  let calls = 0;
  const delays = [];
  const client = createYgoClient({
    key: 'test-only',
    wait: async delay => delays.push(delay),
    requestImpl: async () => ++calls === 1
      ? { status: 429, retryAfter: '2', body: '' }
      : { status: 200, body: '{"Data":{"ID":"ok"}}' },
  });
  assert.equal((await client.getHotel('4458386')).ID, 'ok');
  assert.deepEqual(delays, [2000]);
  calls = 0;
  const throttled = createYgoClient({
    key: 'test-only',
    requestImpl: async () => {
      calls += 1;
      return { status: 429, retryAfter: '120', body: '' };
    },
  });
  await assert.rejects(throttled.getHotel('4458386'), error => error.status === 429 && error.retryAfter === '120');
  assert.equal(calls, 1);
  assert.equal(retryDelay('Tue, 17 Nov 2026 12:00:02 GMT', Date.parse('2026-11-17T12:00:00Z')), 2000);
  assert.equal(retryDelay('invalid'), null);
});

test('invalid upstream envelopes, missing credentials and connection failures are explicit', async () => {
  for (const response of [
    { status: 200, body: '<html>proxy failure</html>' },
    { status: 200, body: '{"Data":null,"Error":{"Message":"private details"}}' },
    { status: 401, body: 'private upstream details' },
  ]) {
    const client = createYgoClient({ key: 'test-only', requestImpl: async () => response });
    await assert.rejects(client.getHotel('4458386'), error =>
      error.status === 502 && !error.message.includes('private'));
  }
  await assert.rejects(createYgoClient({ key: '' }).getHotel('4458386'),
    { code: 'YGO_KEY_MISSING' });
  const failed = createYgoClient({ key: 'test-only', requestImpl: async () => { throw new Error('private transport details'); } });
  await assert.rejects(failed.getHotel('4458386'), { code: 'YGO_CONNECTION_FAILED' });
});
