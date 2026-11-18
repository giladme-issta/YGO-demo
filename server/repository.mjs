import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { HOTEL_IDS, mapHotel, summarizeHotel } from './hotel-data.mjs';
import { AppError } from './errors.mjs';

export function requireHotelId(id) {
  if (!HOTEL_IDS.includes(id)) {
    throw new AppError(404, 'HOTEL_NOT_ALLOWED', 'המלון אינו אחד משמונת המלונות בהדגמה.');
  }
}

export function createHotelRepository({
  mode = 'snapshot',
  cacheDir,
  samplePath,
  client,
  now = Date.now,
  ttl = 5 * 60 * 1000,
  logger = console,
}) {
  if (!['snapshot', 'live', 'sample'].includes(mode)) {
    throw new AppError(500, 'DATA_MODE_INVALID', 'מצב נתוני המלון אינו תקין.');
  }
  const cache = new Map();
  const pending = new Map();

  async function load(id) {
    let raw;
    let fetchedAt;
    if (mode === 'live') {
      raw = await client.getHotel(id);
      fetchedAt = new Date(now()).toISOString();
    } else {
      if (mode === 'sample' && id !== '4458386') {
        throw new AppError(404, 'SAMPLE_HOTEL_UNAVAILABLE', 'המלון אינו זמין בקובץ הדוגמה. יש לסנכרן את נתוני YGO.');
      }
      const file = mode === 'sample' ? samplePath : path.join(cacheDir, `${id}.json`);
      let content;
      try {
        const [text, metadata] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
        content = text;
        fetchedAt = metadata.mtime.toISOString();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        throw new AppError(503, 'SNAPSHOT_MISSING', 'אין נתוני YGO שמורים למלון. יש להריץ סנכרון או לבחור מצב חי.');
      }
      try {
        const parsed = JSON.parse(content.replace(/^\uFEFF/, ''));
        if (parsed.Error) throw new Error('Error envelope');
        raw = parsed.Data ?? parsed;
      } catch {
        throw new AppError(502, 'SNAPSHOT_INVALID', 'קובץ נתוני המלון אינו תקין. יש לסנכרן אותו מחדש.');
      }
    }
    let hotel;
    try {
      hotel = mapHotel(raw, id);
    } catch {
      throw new AppError(502, 'HOTEL_DATA_INVALID', 'נתוני המלון אינם תקינים או שאינם שייכים למלון שנבחר.');
    }
    const entry = { raw, hotel, source: { mode, fetchedAt } };
    cache.set(id, { entry, expires: now() + ttl });
    return entry;
  }

  async function get(id) {
    requireHotelId(id);
    const saved = cache.get(id);
    if (saved && saved.expires > now()) return saved.entry;
    if (pending.has(id)) return pending.get(id);
    const work = load(id).finally(() => pending.delete(id));
    pending.set(id, work);
    return work;
  }

  return {
    mode,
    get,
    async list() {
      const failures = [];
      const hotels = await Promise.all(HOTEL_IDS.map(async (id) => {
        try {
          const entry = await get(id);
          return { ...summarizeHotel(entry.hotel), available: true };
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          failures.push(error);
          logger.warn(`[hotel-list] ${id} ${error.code}`);
          return {
            id, name: `מלון ${id}`, city: '', stars: null, image: '', score: null,
            available: false, error: error.message,
          };
        }
      }));
      if (failures.length === HOTEL_IDS.length) throw failures[0];
      return hotels;
    },
  };
}
