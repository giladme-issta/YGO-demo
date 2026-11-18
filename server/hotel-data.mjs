/** The only YGO product IDs this application may expose. */
export const HOTEL_IDS = Object.freeze([
  '14640478',
  '22362808',
  '17690826',
  '4046285',
  '6895127',
  '4645325',
  '11165062',
  '4458386',
]);

const hotelIdSet = new Set(HOTEL_IDS);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function invalidHotelData(message) {
  return new TypeError(`Invalid hotel data: ${message}`);
}

function unwrapHotel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw invalidHotelData('expected a hotel object');
  }
  if (!hasOwn(raw, 'Data')) return raw;
  if (!raw.Data || typeof raw.Data !== 'object' || Array.isArray(raw.Data)) {
    throw invalidHotelData('expected an API Data object');
  }
  return raw.Data;
}

function optionalRecord(value, field) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidHotelData(`${field} must be an object`);
  }
  return value;
}

function optionalArray(value, field) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw invalidHotelData(`${field} must be an array`);
  return value;
}

function safeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/<\/?[a-z][^>]*>/gi, '').trim();
}

function localizedLeaf(value) {
  if (typeof value === 'string') return safeText(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return safeText(value.Text);
  }
  return '';
}

/**
 * Select Hebrew across all candidate sources before considering any English.
 * A direct string is only used as the final raw-name fallback.
 */
function localizedCandidates(candidates) {
  for (const locale of ['he-IL', 'en-US']) {
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const text = localizedLeaf(candidate[locale]);
      if (text) return text;
    }
  }
  for (const candidate of candidates) {
    const text = localizedLeaf(candidate);
    if (text) return text;
  }
  return '';
}

function generatedCandidates(generated, field) {
  return {
    'he-IL': generated['he-IL']?.[field],
    'en-US': generated['en-US']?.[field],
  };
}

function generatedText(generated, field) {
  return localizedCandidates([generatedCandidates(generated, field)]);
}

function finiteNumber(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonnegativeNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function parseBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function finiteCoordinate(value, minimum, maximum) {
  const number = finiteNumber(value);
  return number !== null && number >= minimum && number <= maximum ? number : null;
}

function cleanMarkdown(value) {
  return safeText(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__|~~|`|\*|_)/g, '')
    .trim();
}

function mapHighlights(text) {
  return safeText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const content = line.replace(/^[-*+]\s+/, '');
      const match = content.match(/^\*\*(.+?)\*\*\s*[:：]\s*(.*)$/);
      if (match) {
        return { title: cleanMarkdown(match[1]), text: cleanMarkdown(match[2]) };
      }
      const separator = content.indexOf(':');
      if (separator > 0) {
        return {
          title: cleanMarkdown(content.slice(0, separator)),
          text: cleanMarkdown(content.slice(separator + 1)),
        };
      }
      return { title: '', text: cleanMarkdown(content) };
    })
    .filter((item) => item.title || item.text);
}

function mapFacilities(attributes) {
  return attributes
    .filter((attribute) => attribute && typeof attribute === 'object' && !Array.isArray(attribute))
    .filter((attribute) => (
      String(attribute.ValueType ?? '').toLowerCase() === 'boolean'
      || typeof attribute.Value === 'boolean'
    ))
    .filter((attribute) => parseBoolean(attribute.Value) === true)
    .map((attribute) => ({
      key: safeText(attribute.Key),
      name: localizedCandidates([attribute.Name]),
      group: safeText(attribute.ParentKey),
      isFree: parseBoolean(attribute.IsFree),
    }))
    .filter((attribute) => attribute.key || attribute.name);
}

function mapImages(images) {
  const seen = new Set();
  const mapped = [];
  for (const image of images) {
    if (!image || typeof image !== 'object' || Array.isArray(image)) continue;
    const url = safeText(image.URL);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    mapped.push({
      id: safeText(image.ID),
      url,
      alt: localizedCandidates([image.Descriptions]),
      category: safeText(image.Category),
    });
  }
  return mapped;
}

function mapDistance(poi) {
  if (parseBoolean(poi.InArea) === true) return 0;
  const distance = nonnegativeNumber(poi.Distance);
  if (distance === null) return null;
  const unit = safeText(poi.Unit ?? poi.DistanceUnit).toLowerCase();
  if (unit === 'm') return distance;
  if (unit === 'km') return distance * 1000;
  return null;
}

function mapPois(pois) {
  return pois
    .filter((poi) => poi && typeof poi === 'object' && !Array.isArray(poi))
    .map((poi) => ({
      id: safeText(poi.ID),
      name: localizedCandidates([poi.Name]),
      type: safeText(poi.Type),
      distanceMeters: mapDistance(poi),
      inArea: parseBoolean(poi.InArea),
    }));
}

function mapBeddings(beddings) {
  if (!Array.isArray(beddings)) return [];
  return beddings.map((alternative) => {
    if (!Array.isArray(alternative)) return [];
    return alternative
      .filter((bed) => bed && typeof bed === 'object' && !Array.isArray(bed))
      .map((bed) => {
        const name = localizedCandidates([bed.Name]) || safeText(bed.Type).replace(/_/g, ' ');
        const quantity = nonnegativeNumber(bed.Quantity);
        if (!name) return '';
        return quantity !== null && quantity > 1 ? `${quantity} ${name}` : name;
      })
      .filter(Boolean);
  }).filter((alternative) => alternative.length);
}

function mapRooms(rooms) {
  return rooms
    .filter((room) => room && typeof room === 'object' && !Array.isArray(room))
    .map((room) => {
      const generated = optionalRecord(room.GeneratedTexts, 'Rooms[].GeneratedTexts');
      const generatedName = generatedCandidates(generated, 'Name');
      const generatedDescription = generatedCandidates(generated, 'Description');
      const facts = optionalArray(room.FactualAttributes, 'Rooms[].FactualAttributes');
      const images = optionalArray(room.Images, 'Rooms[].Images');
      return {
        id: safeText(room.ID),
        name: localizedCandidates([room.Name, generatedName]),
        description: localizedCandidates([generatedDescription]),
        sizeSqm: nonnegativeNumber(room.SizeSqm),
        beddings: mapBeddings(room.Beddings),
        facilities: mapFacilities(facts),
        images: mapImages(images),
      };
    });
}

function mapRating(rawRating) {
  if (rawRating == null) return null;
  const rating = optionalRecord(rawRating, 'GuestRating');
  const texts = optionalRecord(rating.Texts, 'GuestRating.Texts');
  const subScores = optionalRecord(rating.SubScores, 'GuestRating.SubScores');
  const rawScore = finiteNumber(rating.ReviewScore);
  const score = rawScore !== null && rawScore >= 0 && rawScore <= 100
    ? rawScore / 10
    : null;
  const mappedSubScores = {};
  for (const [key, value] of Object.entries(subScores)) {
    const subScore = finiteNumber(value);
    if (subScore !== null && subScore >= 0 && subScore <= 100) {
      mappedSubScores[safeText(key)] = subScore / 10;
    }
  }
  const localizedReview = {
    'he-IL': texts['he-IL']?.Summary,
    'en-US': texts['en-US']?.Summary,
  };
  const getLocalizedArray = (field) => {
    for (const locale of ['he-IL', 'en-US']) {
      const candidate = texts[locale]?.[field];
      if (Array.isArray(candidate)) {
        const values = candidate.map(safeText).filter(Boolean);
        if (values.length) return values;
      }
    }
    return [];
  };
  return {
    score,
    subScores: mappedSubScores,
    summary: localizedCandidates([localizedReview]),
    pros: getLocalizedArray('Pros'),
    cons: getLocalizedArray('Cons'),
  };
}

function timeText(value, preferredKey) {
  if (typeof value === 'string') return safeText(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const preferred = safeText(value[preferredKey]);
  if (preferred) return preferred;
  const otherKey = preferredKey === 'From' ? 'Until' : 'From';
  return safeText(value[otherKey] ?? value.At ?? value.Time);
}

/**
 * Convert a YGO API envelope or bare hotel response into the browser-safe DTO.
 * The upstream ProductID is mandatory and must match the requested allowlisted ID.
 */
export function mapHotel(raw, expectedId) {
  const requestedId = typeof expectedId === 'string' ? expectedId : String(expectedId ?? '');
  if (!hotelIdSet.has(requestedId)) throw invalidHotelData('unsupported hotel identity');

  const hotel = unwrapHotel(raw);
  const externalIds = optionalRecord(hotel.ExternalHotelIDs, 'ExternalHotelIDs');
  const actualId = safeText(externalIds.ProductID);
  if (!actualId || actualId !== requestedId) {
    throw invalidHotelData('hotel identity does not match the requested hotel');
  }

  const names = optionalRecord(hotel.Names, 'Names');
  const location = optionalRecord(hotel.Location, 'Location');
  const address = optionalRecord(location.Address, 'Location.Address');
  const generated = optionalRecord(hotel.GeneratedTexts, 'GeneratedTexts');
  const attributes = optionalArray(hotel.FactualAttributes, 'FactualAttributes');
  const pois = optionalArray(hotel.POIs, 'POIs');
  const images = optionalArray(hotel.Images, 'Images');
  const rooms = optionalArray(hotel.Rooms, 'Rooms');

  return {
    id: actualId,
    name: localizedCandidates([names, hotel.Name]),
    city: localizedCandidates([address.CityNames, address.City]),
    stars: nonnegativeNumber(hotel.Stars),
    location: {
      latitude: finiteCoordinate(location.Latitude, -90, 90),
      longitude: finiteCoordinate(location.Longitude, -180, 180),
      address: safeText(address.Street),
      city: localizedCandidates([address.CityNames, address.City]),
      countryCode: safeText(location.CountryCode),
    },
    summary: generatedText(generated, 'Summary'),
    locationText: generatedText(generated, 'Location'),
    highlights: mapHighlights(generatedText(generated, 'Highlights')),
    facilities: mapFacilities(attributes),
    pois: mapPois(pois),
    images: mapImages(images),
    rooms: mapRooms(rooms),
    policies: {
      checkIn: timeText(hotel.CheckIn, 'From'),
      checkOut: timeText(hotel.CheckOut, 'Until'),
      guestPolicies: generatedText(generated, 'GuestPolicies'),
      policies: generatedText(generated, 'Policies'),
      houseRules: generatedText(generated, 'HouseRules'),
      dining: generatedText(generated, 'Dining'),
    },
    rating: mapRating(hotel.GuestRating),
  };
}

/** Create the compact, browser-safe item used by the hotel selector. */
export function summarizeHotel(mapped) {
  if (!mapped || typeof mapped !== 'object') {
    throw new TypeError('Expected a mapped hotel');
  }
  return {
    id: safeText(mapped.id),
    name: safeText(mapped.name),
    city: safeText(mapped.city),
    stars: nonnegativeNumber(mapped.stars),
    image: safeText(mapped.images?.[0]?.url),
    score: mapped.rating?.score ?? null,
    available: true,
  };
}
