import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHotelRepository } from '../server/repository.mjs';

const rawHotel = id => ({
  ID: `test-${id}`, ExternalHotelIDs: { ProductID: id },
  Names: { 'he-IL': 'מלון בדיקה' }, Images: [], Rooms: [],
});
const logger = { warn() {} };

test('live reads coalesce, cache by allowed hotel, and never silently reuse stale data', async () => {
  let calls = 0;
  let time = 0;
  let fail = false;
  const repository = createHotelRepository({
    mode: 'live', logger, now: () => time, ttl: 100,
    client: { async getHotel(id) {
      calls += 1;
      if (fail) throw new Error('offline');
      return rawHotel(id);
    } },
  });
  const results = await Promise.all([repository.get('4458386'), repository.get('4458386')]);
  assert.equal(calls, 1);
  assert.equal(results[0], results[1]);
  assert.equal((await repository.get('4458386')).hotel.id, '4458386');
  assert.equal(calls, 1);
  await assert.rejects(repository.get('999999'), { code: 'HOTEL_NOT_ALLOWED' });
  assert.equal(calls, 1);
  time = 101;
  fail = true;
  await assert.rejects(repository.get('4458386'), /offline/);
  assert.equal(calls, 2);
});

test('snapshots validate identity and all-missing lists fail instead of pretending to succeed', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ygo-repository-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = createHotelRepository({ mode: 'snapshot', cacheDir: directory, logger });
  await assert.rejects(repository.list(), { code: 'SNAPSHOT_MISSING' });
  await writeFile(path.join(directory, '4458386.json'), JSON.stringify({ Data: rawHotel('14640478') }));
  await assert.rejects(repository.get('4458386'), { code: 'HOTEL_DATA_INVALID' });
  await writeFile(path.join(directory, '4458386.json'), JSON.stringify({ Data: rawHotel('4458386') }));
  const list = await repository.list();
  assert.equal(list.filter(hotel => hotel.available).length, 1);
  assert.equal(list.find(hotel => hotel.id === '4458386').name, 'מלון בדיקה');
  assert.ok(list.filter(hotel => !hotel.available).every(hotel => hotel.error));
});

test('sample mode never assigns the example hotel to another allowed ProductID', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ygo-sample-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const samplePath = path.join(directory, 'sample.json');
  await writeFile(samplePath, JSON.stringify(rawHotel('4458386')));
  const repository = createHotelRepository({ mode: 'sample', samplePath, logger });
  assert.equal((await repository.get('4458386')).source.mode, 'sample');
  await assert.rejects(repository.get('14640478'), { code: 'SAMPLE_HOTEL_UNAVAILABLE' });
});
