import { mkdir, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOTEL_IDS, mapHotel } from '../server/hotel-data.mjs';
import { createYgoClient } from '../server/ygo-client.mjs';

const directory = fileURLToPath(new URL('../.cache/hotels/', import.meta.url));
const client = createYgoClient();
await mkdir(directory, { recursive: true });
let failures = 0;
for (const id of HOTEL_IDS) {
  const temporary = path.join(directory, `${id}.json.tmp-${process.pid}`);
  try {
    const raw = await client.getHotel(id);
    mapHotel(raw, id);
    await writeFile(temporary, JSON.stringify({ Data: raw, Error: null }), 'utf8');
    await rename(temporary, path.join(directory, `${id}.json`));
    console.log(`${id}: saved YGO content`);
  } catch (error) {
    failures += 1;
    console.error(`${id}: sync failed (${error.code || 'INVALID_DATA'}); existing snapshot was not replaced.`);
    try {
      await unlink(temporary);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') console.error(`${id}: temporary-file cleanup failed.`);
    }
  }
}
console.log(`Saved ${HOTEL_IDS.length - failures}/${HOTEL_IDS.length} hotels. Restart the snapshot server after syncing.`);
if (failures) process.exitCode = 1;
