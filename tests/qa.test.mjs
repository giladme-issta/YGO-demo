import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { mapHotel } from '../server/hotel-data.mjs';
import { answerQuestion } from '../server/qa.mjs';

const sample = JSON.parse(
  readFileSync(new URL('../response-api-example.json', import.meta.url), 'utf8'),
);
const sampleHotel = mapHotel(sample, '4458386');

function answer(question, raw = sample, mapped = sampleHotel) {
  return answerQuestion(raw, mapped, question);
}

function emptyContext(overrides = {}) {
  const raw = {
    ExternalHotelIDs: { ProductID: '4458386' },
    Names: { 'he-IL': 'מלון בדיקה' },
    Location: { Address: {} },
    FactualAttributes: [],
    POIs: [],
    Images: [],
    Rooms: [],
    GeneratedTexts: {},
    GuestRating: null,
    ...overrides,
  };
  return { raw, mapped: mapHotel(raw, '4458386') };
}

test('answers hotel-specific beach, arrival, Wi-Fi, and parking questions from evidence', () => {
  const beach = answer('מה המרחק לחוף?');
  assert.equal(beach.source, 'hotel-data');
  assert.match(beach.answer, /200 מטר/);
  assert.deepEqual(beach.quickReplies, []);

  assert.match(answer('מתי הצ׳ק-אין?').answer, /15:00/);
  assert.match(answer('When is check-out?').answer, /12:00/);
  assert.match(answer('האם יש Wi-Fi?').answer, /זמינה/);
  assert.match(answer('האם יש חניה?').answer, /חניה/);
});

test('uses source pet-policy restrictions instead of a generic permission claim', () => {
  const result = answer('האם מותר להביא כלב?');
  assert.equal(result.source, 'hotel-data');
  assert.match(result.answer, /כלבים/);
  assert.match(result.answer, /6 ק״ג|6 ק"ג/);
  assert.match(result.answer, /45 אירו/);
});

test('returns guest-review evidence with the dedicated source label', () => {
  const result = answer('מה אומרים האורחים בביקורות?');
  assert.equal(result.source, 'guest-reviews');
  assert.match(result.answer, /האורחים משבחים|דירוג האורחים/);
  assert.match(result.answer, /8\.7\/10/);
});

test('answers combined check-in and check-out from their separate source fields', () => {
  const result = answer('What are the check-in and check-out times?');
  assert.match(result.answer, /15:00/);
  assert.match(result.answer, /12:00/);
});

test('returns a no-information answer rather than treating missing facts as false', () => {
  const { raw, mapped } = emptyContext();
  const wifi = answerQuestion(raw, mapped, 'האם יש Wi-Fi?');
  assert.equal(wifi.source, 'hotel-data');
  assert.match(wifi.answer, /לא מצאתי/);
  assert.doesNotMatch(wifi.answer, /אינה זמינה|אינו זמין/);

  const parking = answerQuestion(raw, mapped, 'האם יש חניה?');
  assert.match(parking.answer, /לא מצאתי/);

  const review = answerQuestion(raw, mapped, 'מה אומרים בביקורות?');
  assert.equal(review.source, 'guest-reviews');
  assert.match(review.answer, /לא מצאתי/);
});

test('uses an explicit false boolean fact as evidence and ignores truthy text values', () => {
  const { raw, mapped } = emptyContext({
    FactualAttributes: [
      { Key: 'wifi', Value: 'false', ValueType: 'boolean' },
      { Key: 'parking', Value: 'true', ValueType: 'text' },
    ],
  });
  assert.match(answerQuestion(raw, mapped, 'Is Wi-Fi available?').answer, /אינה זמינה/);
  assert.match(answerQuestion(raw, mapped, 'Is parking available?').answer, /לא מצאתי/);
});

test('preserves actual parking restrictions and does not mistake petanque for pets', () => {
  const { raw, mapped } = emptyContext({
    FactualAttributes: [
      { Key: 'parking', Value: 'true', ValueType: 'boolean', IsFree: null },
      { Key: 'petanque', Value: 'true', ValueType: 'boolean' },
    ],
    GeneratedTexts: {
      'he-IL': {
        Policies: { Text: '- חניה זמינה רק בהזמנה מראש.' },
      },
    },
  });
  assert.match(answerQuestion(raw, mapped, 'האם יש חניה?').answer, /רק בהזמנה מראש/);

  const noPetEvidence = emptyContext({
    FactualAttributes: [
      { Key: 'petanque', Value: 'true', ValueType: 'boolean' },
    ],
  });
  const pets = answerQuestion(noPetEvidence.raw, noPetEvidence.mapped, 'האם מותר להביא חיות מחמד?');
  assert.match(pets.answer, /לא מצאתי/);
});

test('keeps pet species evidence scoped and does not infer cats from generic or dog facts', () => {
  const speciesContext = emptyContext({
    FactualAttributes: [
      { Key: 'pets_allowed', Value: 'true', ValueType: 'boolean' },
      { Key: 'dogs_allowed', Value: 'true', ValueType: 'boolean' },
      { Key: 'cats_allowed', Value: 'false', ValueType: 'boolean' },
    ],
    GeneratedTexts: {
      'he-IL': {
        Policies: { Text: '- כלבים מותרים בתיאום מראש.' },
      },
    },
  });

  const cats = answerQuestion(speciesContext.raw, speciesContext.mapped, 'Are cats allowed?');
  assert.match(cats.answer, /חתולים/);
  assert.match(cats.answer, /אינם מותרים/);
  const dogs = answerQuestion(speciesContext.raw, speciesContext.mapped, 'Are dogs allowed?');
  assert.match(dogs.answer, /כלבים מותרים/);

  const onlyDogs = emptyContext({
    FactualAttributes: [
      { Key: 'pets_allowed', Value: 'true', ValueType: 'boolean' },
      { Key: 'dogs_allowed', Value: 'true', ValueType: 'boolean' },
    ],
    GeneratedTexts: {
      'he-IL': {
        Policies: { Text: '- רק כלבים מותרים במלון.' },
      },
    },
  });
  assert.equal(
    answerQuestion(onlyDogs.raw, onlyDogs.mapped, 'Are cats allowed?'),
    null,
  );
  assert.match(
    answerQuestion(onlyDogs.raw, onlyDogs.mapped, 'Are pets allowed?').answer,
    /רק כלבים/,
  );
  assert.equal(
    answerQuestion(onlyDogs.raw, onlyDogs.mapped, 'Are dogs and cats allowed?'),
    null,
  );
});

test('uses Wi-Fi evidence only for its matching room/public scope', () => {
  const context = emptyContext({
    FactualAttributes: [
      {
        Key: 'public_area_wifi',
        Name: { 'en-US': 'Wi-Fi in public areas' },
        Value: 'true',
        ValueType: 'boolean',
      },
      {
        Key: 'room_wifi',
        Name: { 'en-US': 'Wi-Fi in rooms' },
        Value: 'false',
        ValueType: 'boolean',
      },
    ],
  });

  const roomAnswer = answerQuestion(context.raw, context.mapped, 'Is Wi-Fi available in rooms?');
  assert.match(roomAnswer.answer, /חדרים אינו זמין/);
  assert.doesNotMatch(roomAnswer.answer, /זמין לפי נתוני המלון/);

  const publicAnswer = answerQuestion(context.raw, context.mapped, 'Is Wi-Fi available in public areas?');
  assert.match(publicAnswer.answer, /אזורים הציבוריים זמין/);

  const genericAnswer = answerQuestion(context.raw, context.mapped, 'Is Wi-Fi available?');
  assert.match(genericAnswer.answer, /לא מצאתי/);
  assert.equal(
    answerQuestion(context.raw, context.mapped, 'Is Wi-Fi available in rooms and public areas?'),
    null,
  );
});

test('does not report a fee when the matching parking attribute says parking is unavailable', () => {
  const context = emptyContext({
    FactualAttributes: [
      { Key: 'parking', Value: 'false', ValueType: 'boolean', IsFree: true },
    ],
  });

  const amount = answerQuestion(context.raw, context.mapped, 'How much does parking cost?');
  assert.match(amount.answer, /החניה אינה זמינה/);
  assert.doesNotMatch(amount.answer, /חינמית|בתשלום|סכום התשלום/);

  const free = answerQuestion(context.raw, context.mapped, 'Is parking free?');
  assert.match(free.answer, /החניה אינה זמינה/);
  assert.doesNotMatch(free.answer, /חינמית/);
});

test('ignores a non-beach POI whose name contains Beach when finding the nearest beach', () => {
  const context = emptyContext({
    POIs: [
      { ID: 'bar', Name: { 'en-US': 'Beach Bar' }, Type: 'restaurant', Distance: 10, Unit: 'm' },
      { ID: 'beach', Name: { 'en-US': 'Sandy Beach' }, Type: 'beach', Distance: 500, Unit: 'm' },
    ],
  });
  const result = answerQuestion(context.raw, context.mapped, 'How far is the beach?');
  assert.match(result.answer, /500 מטר/);
  assert.doesNotMatch(result.answer, /10 מטר/);
});

test('does not answer a specific fee question with availability when the fee is unknown', () => {
  const { raw, mapped } = emptyContext({
    FactualAttributes: [
      { Key: 'parking', Value: 'true', ValueType: 'boolean', IsFree: null },
    ],
    GeneratedTexts: {
      'he-IL': {
        Policies: { Text: '- חניה זמינה רק בהזמנה מראש.' },
      },
    },
  });

  const amount = answerQuestion(raw, mapped, 'כמה עולה החניה?');
  assert.match(amount.answer, /לא מצאתי/);
  assert.match(amount.answer, /סכום מפורש/);
  assert.doesNotMatch(amount.answer, /זמינה רק בהזמנה/);

  const freeStatus = answerQuestion(raw, mapped, 'האם החניה חינם?');
  assert.match(freeStatus.answer, /לא מצאתי/);
  assert.doesNotMatch(freeStatus.answer, /זמינה לפי נתוני המלון/);
});

test('returns null for ambiguous follow-ups so they can be handled by AI', () => {
  assert.equal(answer('How much is that?'), null);
  assert.equal(answer('Is it free?'), null);
  assert.equal(answer('And what about that?'), null);
});

test('does not use beach evidence to answer airport questions', () => {
  assert.equal(answer('How far is the airport?'), null);
  assert.equal(answer('How far is the airport and the beach?'), null);
  assert.equal(answer('מה המרחק משדה התעופה לחוף?'), null);
});

test('returns null for unsupported, ambiguous, or compound factual questions', () => {
  assert.equal(answer('Which hotel should I book?'), null);
  assert.equal(answer('Is there Wi-Fi and parking?'), null);
  assert.equal(answer('How far is the beach and when is check-in?'), null);
  assert.equal(answerQuestion(sample, sampleHotel, '   '), null);
});

test('returns null if the raw source and mapped hotel identities disagree', () => {
  const wrongHotel = mapHotel({
    ...sample,
    ExternalHotelIDs: { ProductID: '14640478' },
  }, '14640478');
  assert.equal(answerQuestion(sample, wrongHotel, 'מתי הצ׳ק-אין?'), null);
});
