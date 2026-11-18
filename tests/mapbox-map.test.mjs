import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinates, distanceMeters, mapPlaces, mapFailureMessage } from '../public/hotel-page/hotel-map/mapbox-map.js';

test('map errors distinguish missing configuration, stale server, CDN and browser failures', () => {
  const missing = mapFailureMessage(new Error('MAPBOX_HTTP_503'));
  const stale = mapFailureMessage(new Error('MAPBOX_HTTP_404'));
  const cdn = mapFailureMessage(new Error('MAPBOX_SDK_FAILED'));
  const webgl = mapFailureMessage(new Error('MAPBOX_WEBGL_UNAVAILABLE'));
  assert.match(missing, /MAPBOX_PUBLIC_TOKEN/);
  assert.match(stale, /npm start/);
  assert.match(cdn, /CDN/);
  assert.match(webgl, /WebGL/);
  assert.doesNotMatch(cdn, /MAPBOX_PUBLIC_TOKEN/);
  assert.doesNotMatch(mapFailureMessage(new TypeError('Failed to fetch')), /MAPBOX_PUBLIC_TOKEN/);
});

test('map coordinates retain zero and reject missing, nonnumeric and out-of-range positions', () => {
  assert.deepEqual(coordinates({ latitude: 0, longitude: 0 }), [0, 0]);
  assert.deepEqual(coordinates({ latitude: 34.8, longitude: 32.4 }), [32.4, 34.8]);
  for (const location of [null, {}, { latitude: null, longitude: 0 },
    { latitude: '34.8', longitude: 32.4 }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 }, { latitude: NaN, longitude: 0 }]) {
    assert.equal(coordinates(location), null);
  }
});

test('Mapbox places use real coordinates, bounded straight-line distances and mock distance groups', () => {
  const center = [32.4, 34.8];
  const feature = (name, northMeters, id = name) => ({
    properties: { name, mapbox_id: id, coordinates: { longitude: center[0], latitude: center[1] + northMeters / 111195 } },
  });
  const places = mapPlaces([
    feature('Near', 990), feature('Short drive', 1010), feature('Ten km', 9990),
    feature('Day trip', 10010), feature('Too far', 51000), feature(' ', 10),
    { properties: { name: 'No coordinates' } },
    { properties: { name: 'Invalid coordinates', coordinates: { latitude: 95, longitude: 32.4 } } },
  ], center, { id: 'beach', label: 'חוף' });
  assert.deepEqual(places.map(place => place.name), ['Near', 'Short drive', 'Ten km', 'Day trip']);
  assert.deepEqual(places.map(place => place.group), ['walk', 'drive', 'drive', 'day']);
  assert.ok(Math.abs(places[0].distance - 990) < 1);
  assert.equal(places[0].point[0], center[0]);
  assert.equal(mapPlaces([feature('Airport', 1000)], center, { id: 'airport', label: 'Airport' })[0].group, 'arrive');
  assert.equal(distanceMeters(center, center), 0);
});
