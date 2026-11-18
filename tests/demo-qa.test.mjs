import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrounding, createDemoQaClient, parseDemoAnswer } from '../server/demo-qa.mjs';

const raw = { FactualAttributes: [{ Key: 'parking', Value: 'true', ValueType: 'boolean', IsFree: null }] };
const hotel = {
  id: '4458386', name: 'מלון בדיקה', rooms: [{
    id: 'room-1', name: 'חדר', images: [{ url: 'https://example.invalid/image.jpg' }],
  }],
  policies: { checkIn: '15:00' }, pois: [{ name: 'חוף', distanceMeters: 200 }],
};

test('grounding includes hotel evidence and omits photos and commercial mock data', () => {
  const grounding = buildGrounding(raw, hotel);
  assert.ok(grounding.includes('4458386'));
  assert.ok(grounding.includes('"checkIn":"15:00"'));
  assert.ok(grounding.includes('"isFree":null'));
  assert.ok(!grounding.includes('https://example.invalid'));
  assert.ok(!grounding.includes('2128'));
});

test('NDJSON aggregation preserves Hebrew and requires a complete, non-truncated response', () => {
  assert.equal(parseDemoAnswer('{"t":"שלום "}\n{"t":"מהמלון"}\n{"done":true,"truncated":false}\n'), 'שלום מהמלון');
  for (const value of [
    '{"t":"partial"}', '{"t":"partial"}\n{"done":true,"truncated":true}',
    '{"error":"upstream failed"}', '<html>failure</html>', '{"done":true}',
    '{"t":"answer"}\n{"done":true}\n{"t":"late data"}',
  ]) {
    assert.throws(() => parseDemoAnswer(value), { code: 'AI_INVALID_RESPONSE' });
  }
});

test('YGO demo receives grounding and conversation, not browser credentials or arbitrary endpoint', async () => {
  let sent;
  const client = createDemoQaClient({
    auth: 'Basic dGVzdDp0ZXN0',
    requestImpl: async request => {
      sent = request;
      return { status: 200, body: '{"t":"תשובה"}\n{"done":true,"truncated":false}' };
    },
  });
  const result = await client.ask(raw, hotel, 'מה במלון?', [{ role: 'user', content: 'שלום' }]);
  assert.equal(result.source, 'ygo-ai');
  assert.equal(result.answer, 'תשובה');
  assert.equal(sent.url, 'https://ygo-sales-demo.preview.ygo.ai/api/ask');
  assert.equal(sent.body.messages.length, 3);
  assert.equal(sent.body.messages.at(-1).content, 'מה במלון?');
  assert.ok(sent.body.messages[0].content.includes('מלון בדיקה'));
});

test('unconfigured or rejected demo authorization stays an explicit failure', async () => {
  const unconfigured = createDemoQaClient({ auth: '' });
  assert.equal(unconfigured.available, false);
  await assert.rejects(unconfigured.ask(raw, hotel, 'question'), { code: 'AI_UNAVAILABLE' });
  const rejected = createDemoQaClient({
    auth: 'Basic dGVzdDp0ZXN0',
    requestImpl: async () => ({ status: 401, body: 'Sign in' }),
  });
  await assert.rejects(rejected.ask(raw, hotel, 'question'), { code: 'AI_ACCESS_DENIED' });
});

test('malformed optional factual entries do not prevent a grounded AI request', async () => {
  let grounding;
  const client = createDemoQaClient({
    auth: 'Basic dGVzdDp0ZXN0',
    requestImpl: async request => {
      grounding = request.body.messages[0].content;
      return { status: 200, body: '{"t":"answer"}\n{"done":true}' };
    },
  });
  await client.ask({ FactualAttributes: [null, false, 'invalid', [], ...raw.FactualAttributes] },
    hotel, 'question');
  assert.ok(grounding.includes('"key":"parking"'));
  assert.ok(!grounding.includes('invalid'));
});
