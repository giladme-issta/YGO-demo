import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HOTEL_IDS, mapHotel, summarizeHotel } from '../server/hotel-data.mjs';

const sample = JSON.parse(
  readFileSync(new URL('../response-api-example.json', import.meta.url), 'utf8'),
);

function hotel(overrides = {}) {
  return {
    ExternalHotelIDs: { ProductID: '4458386' },
    Names: { 'he-IL': 'שם המלון', 'en-US': 'Hotel Name' },
    Stars: 4,
    Location: {
      Latitude: 34.9,
      Longitude: 32.4,
      CountryCode: 'CY',
      Address: { Street: '1 Main Street', CityNames: { 'he-IL': 'פאפוס', 'en-US': 'Paphos' } },
    },
    GeneratedTexts: {
      'he-IL': {
        Summary: { Text: 'תיאור המלון' },
        Location: { Text: 'במרכז העיר' },
        Highlights: { Text: '- **בריכה**: בריכה חיצונית\n- **נוף**: נוף לים' },
      },
    },
    FactualAttributes: [],
    POIs: [],
    Images: [],
    Rooms: [],
    CheckIn: { From: '15:00' },
    CheckOut: { Until: '12:00' },
    GuestRating: null,
    ...overrides,
  };
}

test('maps the real bare response to the exact browser DTO and summary', () => {
  const mapped = mapHotel(sample, '4458386');

  assert.deepEqual(Object.keys(mapped), [
    'id',
    'name',
    'city',
    'stars',
    'location',
    'summary',
    'locationText',
    'highlights',
    'facilities',
    'pois',
    'images',
    'rooms',
    'policies',
    'rating',
  ]);
  assert.equal(mapped.id, '4458386');
  // The official hotel name is English in both the Hebrew and English fields.
  assert.equal(mapped.name, 'Leonardo Laura Beach and Splash Resort');
  assert.equal(mapped.city, 'פאפוס');
  assert.ok(mapped.summary.length > 0);
  assert.ok(mapped.highlights.length > 0);
  assert.equal(mapped.rating.score, 8.7);
  assert.equal(mapped.location.latitude, sample.Location.Latitude);
  assert.deepEqual(Object.keys(mapped.images[0]), ['id', 'url', 'alt', 'category']);

  const summary = summarizeHotel(mapped);
  assert.deepEqual(summary, {
    id: '4458386',
    name: mapped.name,
    city: mapped.city,
    stars: 4,
    image: mapped.images[0].url,
    score: 8.7,
    available: true,
  });
  assert.deepEqual(Object.keys(summary), [
    'id', 'name', 'city', 'stars', 'image', 'score', 'available',
  ]);
});

test('uses nonempty Hebrew first, then English, then the raw hotel name', () => {
  assert.equal(
    mapHotel(hotel({ Names: { 'he-IL': ' שם בעברית ', 'en-US': 'English name' } }), '4458386').name,
    'שם בעברית',
  );
  assert.equal(
    mapHotel(hotel({ Names: { 'he-IL': '   ', 'en-US': 'English name' } }), '4458386').name,
    'English name',
  );
  assert.equal(
    mapHotel(hotel({
      Names: { 'he-IL': ' ', 'en-US': '' },
      Name: 'Raw fallback',
    }), '4458386').name,
    'Raw fallback',
  );
});

test('prefers a Hebrew generated room name over English in another source', () => {
  const mapped = mapHotel(hotel({
    Rooms: [{
      ID: 'room-1',
      Name: { 'en-US': 'English direct room name' },
      SizeSqm: 28,
      Beddings: [[
        { Type: 'SINGLE', Quantity: 2, Name: { 'en-US': 'single beds' } },
      ]],
      FactualAttributes: [],
      GeneratedTexts: {
        'he-IL': {
          Name: { Text: 'שם חדר שנוצר בעברית' },
          Description: { Text: 'תיאור חדר בעברית' },
        },
        'en-US': {
          Name: { Text: 'English generated name' },
          Description: { Text: 'English room description' },
        },
      },
      Images: [],
    }],
  }), '4458386');

  assert.equal(mapped.rooms[0].name, 'שם חדר שנוצר בעברית');
  assert.equal(mapped.rooms[0].description, 'תיאור חדר בעברית');
  assert.deepEqual(mapped.rooms[0].beddings, [['2 single beds']]);
});

test('handles boolean attributes without treating false or text values as true', () => {
  const mapped = mapHotel(hotel({
    FactualAttributes: [
      {
        Key: 'wifi',
        Name: { 'he-IL': 'אינטרנט אלחוטי' },
        Value: 'false',
        ValueType: 'boolean',
        ParentKey: 'connectivity',
        IsFree: true,
      },
      {
        Key: 'parking',
        Name: { 'en-US': 'Parking' },
        Value: 'true',
        ValueType: 'text',
      },
      {
        Key: 'pool',
        Name: { 'he-IL': 'בריכה' },
        Value: 'true',
        ValueType: 'boolean',
        ParentKey: 'wellness',
        IsFree: 'false',
      },
    ],
  }), '4458386');

  assert.deepEqual(mapped.facilities, [{
    key: 'pool',
    name: 'בריכה',
    group: 'wellness',
    isFree: false,
  }]);
});

test('normalizes only known POI units and represents in-area places as zero meters', () => {
  const mapped = mapHotel(hotel({
    POIs: [
      { ID: 'm', Name: { 'he-IL': 'חוף א' }, Type: 'beach', Distance: 250, Unit: 'm' },
      { ID: 'km', Name: { 'en-US': 'Beach B' }, Type: 'beach', Distance: 1.2, Unit: 'km' },
      { ID: 'unknown', Type: 'beach', Distance: 2, Unit: 'mi' },
      { ID: 'negative', Type: 'beach', Distance: -1, Unit: 'm' },
      { ID: 'invalid', Type: 'beach', Distance: 'not-a-number', Unit: 'm' },
      { ID: 'inside', Type: 'beach', Distance: -1, Unit: 'unknown', InArea: 'true' },
    ],
  }), '4458386');

  assert.deepEqual(mapped.pois.map((poi) => poi.distanceMeters), [
    250, 1200, null, null, null, 0,
  ]);
  assert.equal(mapped.pois[5].inArea, true);
});

test('deduplicates image URLs and maps no unapproved image fields', () => {
  const mapped = mapHotel(hotel({
    Images: [
      {
        ID: 'first',
        URL: 'https://images.example/hotel.jpg',
        Category: 'exterior',
        Descriptions: { 'he-IL': 'תמונה ראשית', 'en-US': 'Main image' },
        Compliance: { SensitiveUnusedValue: 'not exposed' },
      },
      {
        ID: 'duplicate',
        URL: 'https://images.example/hotel.jpg',
        Category: 'duplicate',
      },
    ],
  }), '4458386');

  assert.deepEqual(mapped.images, [{
    id: 'first',
    url: 'https://images.example/hotel.jpg',
    alt: 'תמונה ראשית',
    category: 'exterior',
  }]);
});

test('scales present ratings, omits absent subscores, and keeps missing data empty', () => {
  const mapped = mapHotel(hotel({
    Names: { 'he-IL': ' ', 'en-US': 'Name' },
    Stars: null,
    Location: { Address: {} },
    GeneratedTexts: {},
    GuestRating: { ReviewScore: 0, SubScores: { Service: 90, Missing: null }, Texts: {} },
  }), '4458386');

  assert.equal(mapped.rating.score, 0);
  assert.deepEqual(mapped.rating.subScores, { Service: 9 });
  assert.equal(mapped.rating.summary, '');
  assert.equal(mapped.stars, null);
  assert.equal(mapped.summary, '');
  assert.deepEqual(mapped.highlights, []);
  assert.deepEqual(mapped.rooms, []);
  assert.deepEqual(mapped.images, []);
  assert.equal(mapped.location.latitude, null);
  assert.equal(mapped.location.longitude, null);
});

test('rejects identity mismatch, unsupported IDs, and malformed critical shapes safely', () => {
  assert.throws(
    () => mapHotel(hotel(), '14640478'),
    /Invalid hotel data: hotel identity does not match the requested hotel/,
  );
  assert.throws(
    () => mapHotel(hotel(), 'not-allowed'),
    /Invalid hotel data: unsupported hotel identity/,
  );
  assert.throws(
    () => mapHotel({ Data: [] }, '4458386'),
    /Invalid hotel data: expected an API Data object/,
  );
  assert.throws(
    () => mapHotel(hotel({ Images: {} }), '4458386'),
    /Invalid hotel data: Images must be an array/,
  );
});

test('exports the frozen eight-hotel allowlist used by the mapper', () => {
  assert.equal(Object.isFrozen(HOTEL_IDS), true);
  assert.deepEqual(HOTEL_IDS, [
    '14640478',
    '22362808',
    '17690826',
    '4046285',
    '6895127',
    '4645325',
    '11165062',
    '4458386',
  ]);
});
