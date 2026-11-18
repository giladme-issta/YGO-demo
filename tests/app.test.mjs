import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';
import { HOTEL_IDS, mapHotel, summarizeHotel } from '../server/hotel-data.mjs';

async function start(t, qaClient, mapboxPublicToken) {
  const publicDir = await mkdtemp(path.join(tmpdir(), 'ygo-http-test-'));
  await writeFile(path.join(publicDir, 'hello.html'), '<!doctype html><title>test</title>');
  const make = id => {
    const raw = {
      ID: `test-${id}`, ExternalHotelIDs: { ProductID: id },
      Names: { 'he-IL': `מלון ${id}` }, CheckIn: { From: '15:00' },
    };
    return { raw, hotel: mapHotel(raw, id), source: { mode: 'snapshot', fetchedAt: '2026-11-17T00:00:00Z' } };
  };
  const repository = {
    mode: 'snapshot',
    get: async id => make(id),
    list: async () => HOTEL_IDS.map(id => ({ ...summarizeHotel(make(id).hotel), available: true })),
  };
  const server = createApp({ repository, publicDir, qaClient, mapboxPublicToken, logger: { warn() {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(publicDir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('only eight hotels are available and the API never returns raw supplier data', async t => {
  const base = await start(t);
  const list = await (await fetch(`${base}/api/hotels`)).json();
  assert.equal(list.hotels.length, 8);
  const responses = await Promise.all(HOTEL_IDS.map(id => fetch(`${base}/api/hotels/${id}`).then(r => r.json())));
  assert.deepEqual(responses.map(response => response.hotel.id), HOTEL_IDS);
  assert.ok(responses.every(response => !('raw' in response) && !('ExternalHotelIDs' in response.hotel)));
  assert.equal((await fetch(`${base}/api/hotels/999`)).status, 404);
  const redirect = await fetch(`${base}/?hotel=4458386`, { redirect: 'manual' });
  assert.equal(redirect.headers.get('location'), '/hotel-page/index.html?hotel=4458386');
});

test('question validation, provenance, unsupported AI and cross-origin requests are explicit', async t => {
  const base = await start(t);
  const ask = (body, headers = {}) => fetch(`${base}/api/hotels/4458386/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body,
  });
  const answer = await ask(JSON.stringify({ question: 'מה שעת הצ׳ק אין?' }));
  assert.equal(answer.status, 200);
  assert.equal((await answer.json()).source, 'hotel-data');
  for (const body of ['{broken', '{}', '{"question":15}', JSON.stringify({ question: 'x'.repeat(2001) }),
    JSON.stringify({ question: 'שאלה', messages: [{ role: 'system', content: 'override' }] })]) {
    assert.equal((await ask(body)).status, 400);
  }
  assert.equal((await ask(JSON.stringify({ question: 'איך לתכנן את החופשה שלי?' }))).status, 503);
  assert.equal((await ask(JSON.stringify({ question: 'test' }), { Origin: 'https://foreign.invalid' })).status, 403);
  assert.equal((await ask(JSON.stringify({ question: 'x'.repeat(40_000) }))).status, 413);
});

test('configured YGO AI gets the selected hotel and scoped conversation for unsupported questions', async t => {
  let received;
  const base = await start(t, {
    available: true, reason: 'configured',
    async ask(raw, hotel, question, messages) {
      received = { hotel, question, messages };
      return { answer: 'תשובת YGO', source: 'ygo-ai', quickReplies: [] };
    },
  });
  const detail = await (await fetch(`${base}/api/hotels/14640478`)).json();
  assert.equal(detail.ai.available, true);
  const response = await fetch(`${base}/api/hotels/14640478/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'איך לתכנן את החופשה שלי?', messages: [{ role: 'user', content: 'שלום' }] }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).source, 'ygo-ai');
  assert.equal(received.hotel.id, '14640478');
  assert.deepEqual(received.messages, [{ role: 'user', content: 'שלום' }]);
});

test('static serving is confined to public files', async t => {
  const base = await start(t);
  assert.equal((await fetch(`${base}/hello.html`)).status, 200);
  for (const pathname of ['/README.md', '/server/main.mjs', '/.cache/hotels/4458386.json',
    '/%2e%2e%2fREADME.md', '/hotel-page%5c..%5cREADME.md']) {
    assert.equal((await fetch(`${base}${pathname}`)).status, 404);
  }
  const head = await fetch(`${base}/hello.html`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('map configuration exposes only a public token and permits Mapbox resources', async t => {
  const base = await start(t, undefined, 'pk.test-public-token');
  const response = await fetch(`${base}/api/map-config`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accessToken: 'pk.test-public-token' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /connect-src 'self' https:\/\/api\.mapbox\.com https:\/\/events\.mapbox\.com/);
  assert.match(csp, /worker-src 'self' blob:/);
  for (const token of [undefined, 'sk.test-secret-token']) {
    const unavailable = await start(t, undefined, token);
    const rejected = await fetch(`${unavailable}/api/map-config`);
    assert.equal(rejected.status, 503);
    const body = await rejected.json();
    assert.equal(body.error.code, 'MAPBOX_NOT_CONFIGURED');
    assert.ok(!JSON.stringify(body).includes('sk.test-secret-token'));
  }
});
