import { HOTEL_IDS } from './hotel-data.mjs';

const allowedIds = new Set(HOTEL_IDS);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function text(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/<\/?[a-z][^>]*>/gi, '').trim();
}

function unwrap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  if (!hasOwn(raw, 'Data')) return raw;
  return raw.Data && typeof raw.Data === 'object' && !Array.isArray(raw.Data)
    ? raw.Data
    : {};
}

function localeText(value) {
  if (typeof value === 'string') return text(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return text(value.Text);
  }
  return '';
}

function localizedText(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return localeText(value['he-IL']) || localeText(value['en-US']);
}

function generatedText(data, field, mappedField) {
  const generated = data.GeneratedTexts;
  if (generated && typeof generated === 'object' && !Array.isArray(generated)) {
    const hebrew = localeText(generated['he-IL']?.[field]);
    if (hebrew) return hebrew;
    const english = localeText(generated['en-US']?.[field]);
    if (english) return english;
  }
  return text(mappedField);
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function isBooleanFact(fact) {
  return String(fact?.ValueType ?? '').toLowerCase() === 'boolean'
    || typeof fact?.Value === 'boolean';
}

function wifiScope(value) {
  const room = /rooms?|in[_\s-]?room|guest[_\s-]?rooms?|חדר(?:ים|י)?|חדרי/.test(value);
  const publicArea = /public|lobby|common[_\s-]?areas?|שטחים ציבוריים|אזורים ציבוריים|לובי|מרחבים ציבוריים/.test(value);
  if (room && publicArea) return 'ambiguous';
  if (room) return 'room';
  if (publicArea) return 'public';
  return 'generic';
}

function petScope(query) {
  const dogs = /\b(?:dog|dogs)\b|כלב(?:ים)?/.test(query);
  const cats = /\b(?:cat|cats)\b|חתול(?:ים)?/.test(query);
  if (dogs && cats) return 'ambiguous';
  if (dogs) return 'dog';
  if (cats) return 'cat';
  return 'generic';
}

function matchesFact(fact, kind, scope) {
  const key = text(fact?.Key).toLowerCase();
  const name = localizedText(fact?.Name).toLowerCase();
  const value = `${key} ${name}`;
  if (kind === 'wifi') {
    const hasWifi = /(^|[\s_-])wi[\s_-]?fi([\s_-]|$)|wifi|wireless\s+internet|ווי.?פיי|אינטרנט אלחוטי/.test(value);
    return hasWifi && wifiScope(value) === scope;
  }
  if (kind === 'parking') return /parking|חניה|חנייה/.test(value);
  if (scope === 'dog') {
    return /dogs?_allowed|(?:^|[\s_-])dogs?(?:$|[\s_-])|כלב(?:ים)?/.test(value);
  }
  if (scope === 'cat') {
    return /cats?_allowed|(?:^|[\s_-])cats?(?:$|[\s_-])|חתול(?:ים)?/.test(value);
  }
  return /pets?_allowed|animals?_allowed|(?:^|[\s_-])(?:pet|pets|animal|animals)(?:$|[\s_-])|חיות\s*מחמד|חיית\s*מחמד/.test(value);
}

function findFact(data, kind, scope = 'generic') {
  if (!Array.isArray(data.FactualAttributes)) return null;
  const matches = [];
  for (const fact of data.FactualAttributes) {
    if (!fact || typeof fact !== 'object' || !isBooleanFact(fact)) continue;
    const value = booleanValue(fact.Value);
    if (value !== null && matchesFact(fact, kind, scope)) {
      matches.push({ value, isFree: booleanValue(fact.IsFree) });
    }
  }
  if (new Set(matches.map((fact) => fact.value)).size > 1) return null;
  return matches[0] || null;
}

function factAnswer(kind, fact, scope = 'generic') {
  if (kind === 'pets' && scope !== 'generic') {
    const animal = scope === 'dog' ? 'כלבים' : 'חתולים';
    if (fact.value === false) return `לפי נתוני המלון, ${animal} אינם מותרים.`;
    const charge = fact.isFree === true
      ? ' ומסומנים כחינמיים'
      : fact.isFree === false
        ? ' ומסומנים כשירות בתשלום'
        : '';
    return `לפי נתוני המלון, ${animal} מותרים${charge}.`;
  }
  const labels = {
    wifi: ['Wi-Fi', 'Wi-Fi'],
    parking: ['חניה', 'החניה'],
    pets: ['חיות מחמד', 'חיות מחמד'],
  };
  if (kind === 'wifi' && scope !== 'generic') {
    const area = scope === 'room' ? 'Wi-Fi בחדרים' : 'Wi-Fi באזורים הציבוריים';
    if (fact.value === false) return `לפי נתוני המלון, ${area} אינו זמין.`;
    const charge = fact.isFree === true
      ? ' ומסומן כחינמי'
      : fact.isFree === false
        ? ' ומסומן כשירות בתשלום'
        : '';
    return `כן, ${area} זמין לפי נתוני המלון${charge}.`;
  }
  const [noun, subject] = labels[kind];
  if (fact.value === false) {
    if (kind === 'pets') return 'לפי נתוני המלון, חיות מחמד אינן מותרות.';
    return `לפי נתוני המלון, ${subject} אינה זמינה.`;
  }
  if (kind === 'pets') {
    const charge = fact.isFree === true
      ? ' ומסומנות כחינמיות'
      : fact.isFree === false
        ? ' ומסומנות כשירות בתשלום'
        : '';
    return `לפי נתוני המלון, ${noun} מותרות${charge}.`;
  }
  const charge = fact.isFree === true
    ? ' ומסומנת כחינמית'
    : fact.isFree === false
      ? ' ומסומנת כשירות בתשלום'
      : '';
  return `כן, ${subject} זמינה לפי נתוני המלון${charge}.`;
}

function relevantPolicyLines(data, mapped, kind, scope = 'generic') {
  const policyTexts = [
    generatedText(data, 'Policies', mapped?.policies?.policies),
    generatedText(data, 'GuestPolicies', mapped?.policies?.guestPolicies),
    generatedText(data, 'HouseRules', mapped?.policies?.houseRules),
  ];
  const policyPattern = kind === 'parking'
    ? /parking|חניה|חנייה/i
    : kind === 'wifi'
      ? /wi[\s-]?fi|wifi|wireless\s+internet|אינטרנט\s+אלחוטי|ווי.?פיי/i
      : scope === 'dog'
        ? /dogs?|כלב(?:ים)?/i
        : scope === 'cat'
          ? /cats?|חתול(?:ים)?/i
          : /pets?_allowed|(?:^|[\s_-])(?:pet|pets|animal|animals|dog|dogs|cat|cats)(?:$|[\s_-])|חיות|חיית|כלב(?:ים)?|חתול(?:ים)?/i;
  const lines = [];
  for (const policy of policyTexts) {
    for (const line of policy.split(/\r?\n/)) {
      const cleanLine = text(line.replace(/^\s*[-*+]\s*/, ''));
      const scopeMatches = kind !== 'wifi' || wifiScope(cleanLine) === scope;
      if (cleanLine && scopeMatches && policyPattern.test(cleanLine) && !lines.includes(cleanLine)) {
        lines.push(cleanLine);
      }
    }
  }
  return lines;
}

function policyStatesFee(line) {
  return /(?:[$€£]\s*\d|\d[\d,.]*\s*(?:[$€£]|eur|usd|gbp|nis|ils|euros?|dollars?|pounds?|ש״ח|ש"ח|שקל(?:ים)?|אירו|דולר|ליש״ט|ליש"ט))|(?:free(?:\s+of\s+charge)?|complimentary|no\s+charge|paid|chargeable|חינם|ללא\s+תשלום|בתשלום|כרוך\s+בתשלום)/i.test(line);
}

function noFeeInformation(kind, asksAmount, scope = 'generic') {
  const amountSubject = kind === 'wifi'
    ? `עבור השימוש ב-Wi-Fi${scope === 'generic' ? '' : scope === 'room' ? ' בחדרים' : ' באזורים הציבוריים'}`
    : kind === 'parking'
      ? 'עבור החניה'
      : `עבור ${scope === 'dog' ? 'הבאת כלבים' : scope === 'cat' ? 'הבאת חתולים' : 'הבאת חיות מחמד'}`;
  const statusSubject = kind === 'wifi'
    ? `השימוש ב-Wi-Fi${scope === 'generic' ? '' : scope === 'room' ? ' בחדרים' : ' באזורים הציבוריים'} כרוך בתשלום`
    : kind === 'parking'
      ? 'החניה כרוכה בתשלום'
      : `${scope === 'dog' ? 'הבאת כלבים' : scope === 'cat' ? 'הבאת חתולים' : 'הבאת חיות מחמד'} כרוכה בתשלום`;
  return asksAmount
    ? `לא מצאתי במידע המלון סכום מפורש ${amountSubject}.`
    : `לא מצאתי במידע המלון אם ${statusSubject}.`;
}

function knownFeeAnswer(kind, isFree, scope = 'generic') {
  const subject = kind === 'wifi'
    ? `השימוש ב-Wi-Fi${scope === 'generic' ? '' : scope === 'room' ? ' בחדרים' : ' באזורים הציבוריים'}`
    : kind === 'parking'
      ? 'החניה'
      : `הבאת ${scope === 'dog' ? 'כלבים' : scope === 'cat' ? 'חתולים' : 'חיות מחמד'}`;
  const adjective = kind === 'parking' || kind === 'pets' ? 'כרוכה' : 'כרוך';
  if (isFree) {
    const freeAdjective = kind === 'parking' || kind === 'pets' ? 'חינמית' : 'חינמי';
    const marked = kind === 'parking' ? 'מסומנת' : kind === 'pets' ? 'מסומנת' : 'מסומן';
    return `לפי נתוני המלון, ${subject} ${marked} כ${freeAdjective}; לא מצוין סכום לתשלום.`;
  }
  return `לפי נתוני המלון, ${subject} ${adjective} בתשלום, אך סכום התשלום אינו מצוין.`;
}

function beachPois(mapped) {
  if (!Array.isArray(mapped?.pois)) return [];
  return mapped.pois
    .filter((poi) => poi && typeof poi === 'object')
    .filter((poi) => {
      const type = text(poi.type).toLowerCase();
      const name = text(poi.name).toLowerCase();
      return type ? type === 'beach' : /beach|חוף/.test(name);
    })
    .filter((poi) => (
      typeof poi.distanceMeters === 'number'
      && Number.isFinite(poi.distanceMeters)
      && poi.distanceMeters >= 0
    ))
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
}

function formatDistance(meters) {
  if (meters >= 1000) {
    const kilometers = Number((meters / 1000).toFixed(1));
    return `${kilometers} ק״מ`;
  }
  const rounded = Number(meters.toFixed(1));
  return `${rounded} מטר`;
}

function beachAnswer(mapped) {
  const closest = beachPois(mapped)[0];
  if (!closest) {
    return 'לא מצאתי במידע המאומת של המלון מרחק לים או לחוף.';
  }
  if (closest.inArea === true) {
    return closest.name
      ? `${closest.name} מצוין כחוף הנמצא בשטח המלון (מרחק 0 מטר).`
      : 'החוף מצוין כנמצא בשטח המלון (מרחק 0 מטר).';
  }
  const name = closest.name ? `${closest.name}: ` : '';
  return `${name}מרחק החוף הקרוב ביותר לפי נתוני המלון הוא ${formatDistance(closest.distanceMeters)}.`;
}

function timeWindow(value, fallback) {
  if (typeof value === 'string' && text(value)) {
    return { from: '', until: text(value) };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      from: text(value.From ?? value.from ?? value.At ?? value.Time),
      until: text(value.Until ?? value.until),
    };
  }
  return fallback ? { from: '', until: text(fallback) } : { from: '', until: '' };
}

function checkTimeAnswer(data, mapped, wantsIn, wantsOut) {
  const checkIn = timeWindow(data.CheckIn, mapped?.policies?.checkIn);
  const checkOut = timeWindow(data.CheckOut, mapped?.policies?.checkOut);
  const answers = [];
  if (wantsIn) {
    if (checkIn.from && checkIn.until) {
      answers.push(`הצ׳ק-אין אפשרי בין ${checkIn.from} ל־${checkIn.until}.`);
    } else if (checkIn.from) {
      answers.push(`הצ׳ק-אין מתחיל ב־${checkIn.from}.`);
    } else if (checkIn.until) {
      answers.push(`שעת הצ׳ק-אין היא ${checkIn.until}.`);
    } else {
      answers.push('לא מצאתי במידע המלון שעת צ׳ק-אין.');
    }
  }
  if (wantsOut) {
    if (checkOut.from && checkOut.until) {
      answers.push(`הצ׳ק-אאוט אפשרי בין ${checkOut.from} ל־${checkOut.until}.`);
    } else if (checkOut.until) {
      answers.push(`יש לבצע צ׳ק-אאוט עד ${checkOut.until}.`);
    } else if (checkOut.from) {
      answers.push(`שעת הצ׳ק-אאוט היא ${checkOut.from}.`);
    } else {
      answers.push('לא מצאתי במידע המלון שעת צ׳ק-אאוט.');
    }
  }
  return answers.join(' ');
}

function reviewAnswer(mapped) {
  const rating = mapped?.rating;
  if (!rating || typeof rating !== 'object') {
    return 'לא מצאתי במידע הזמין סיכום של ביקורות האורחים.';
  }
  const parts = [];
  if (text(rating.summary)) parts.push(text(rating.summary));
  if (typeof rating.score === 'number' && Number.isFinite(rating.score)) {
    parts.push(`דירוג האורחים הוא ${rating.score}/10.`);
  }
  if (!parts.length && Array.isArray(rating.pros) && rating.pros.length) {
    parts.push(`יתרונות שצוינו בביקורות: ${rating.pros.map(text).filter(Boolean).join('، ')}.`);
  }
  if (!parts.length && Array.isArray(rating.cons) && rating.cons.length) {
    parts.push(`הערות שצוינו בביקורות: ${rating.cons.map(text).filter(Boolean).join('، ')}.`);
  }
  return parts.join(' ') || 'לא מצאתי במידע הזמין סיכום של ביקורות האורחים.';
}

function result(answer, source = 'hotel-data') {
  return { answer, source, quickReplies: [] };
}

/**
 * Answer only a single supported factual intent, using mapped evidence and
 * source policy text. Unsupported or ambiguous questions return null.
 */
export function answerQuestion(raw, mapped, question) {
  if (typeof question !== 'string' || !question.trim()) return null;
  const data = unwrap(raw);
  const mappedId = text(mapped?.id);
  const sourceId = text(data.ExternalHotelIDs?.ProductID);
  if (
    (mappedId && !allowedIds.has(mappedId))
    || (mappedId && sourceId && mappedId !== sourceId)
  ) return null;

  const query = question.toLowerCase();
  if (/airport|air\s+port|נמל\s*ה?תעופה|שדה\s*ה?תעופה/.test(query)) return null;

  const beach = /beach|shore|חוף|חופים/.test(query);
  const checkIn = /check[\s-]?in|צ['׳]?ק[\s-]?אין|צק[\s-]?אין|צ׳ק[\s-]?אין|שעת\s+הגעה|קבלת\s+חדר/.test(query);
  const checkOut = /check[\s-]?out|צ['׳]?ק[\s-]?אאוט|צק[\s-]?אאוט|צ׳ק[\s-]?אאוט|שעת\s+עזיבה|עזיבה|יציאה/.test(query);
  const wifi = /wi[\s-]?fi|wifi|wireless\s+internet|אינטרנט\s+אלחוטי|ווי.?פיי/.test(query);
  const parking = /parking|car\s+park|חניה|חנייה/.test(query);
  const pets = /\b(?:pet|pets|dog|dogs|cat|cats|animal|animals)\b|חיות\s*מחמד|חיית\s*מחמד|כלב(?:ים)?|חתול(?:ים)?/.test(query);
  const reviews = /reviews?|guest\s+feedback|guest\s+opinions?|rating|score|ביקורות?|חוות\s+דעת|דירוג/.test(query);

  const intents = [beach, checkIn || checkOut, wifi, parking, pets, reviews]
    .filter(Boolean).length;
  if (intents !== 1) return null;
  const requestedPetScope = pets ? petScope(query) : 'generic';
  const requestedWifiScope = wifi ? wifiScope(query) : 'generic';
  if (requestedPetScope === 'ambiguous' || requestedWifiScope === 'ambiguous') return null;

  if (beach) return result(beachAnswer(mapped));
  if (checkIn || checkOut) {
    return result(checkTimeAnswer(data, mapped, checkIn, checkOut));
  }
  if (wifi || parking || pets) {
    const kind = wifi ? 'wifi' : parking ? 'parking' : 'pets';
    const scope = kind === 'wifi'
      ? requestedWifiScope
      : kind === 'pets'
        ? requestedPetScope
        : 'generic';
    const fact = findFact(data, kind, scope);
    const policy = relevantPolicyLines(data, mapped, kind, scope);
    if (fact?.value === false) return result(factAnswer(kind, fact, scope));
    if (scope !== 'generic' && !fact && !policy.length) return null;
    const asksAmount = /\bhow\s+much\b|\bwhat(?:'s| is| are)\s+(?:the\s+)?(?:price|cost|fee)\b|\bwhat\s+does\b.*\b(?:cost|charge)\b|\b(?:price|cost|fee)\s+amount\b|כמה(?:\s+זה)?\s+עולה|מה\s+(?:ה)?(?:עלות|מחיר)|מה\s+גובה\s+(?:התשלום|העלות)|תעריף/i.test(query);
    const asksFeeStatus = /\bfree\b|\bpaid\b|\bcomplimentary\b|\bfee\b|\bcost\b|\bcharge\b|חינם|חינמי|בתשלום|ללא\s+תשלום|תשלום|לשלם|משלמים|עלות|מחיר|עולה/i.test(query);

    if (asksAmount) {
      const pricedPolicy = policy.filter(policyStatesFee);
      if (pricedPolicy.length) return result(pricedPolicy.join(' '));
      if (fact?.isFree === true) {
        return result(knownFeeAnswer(kind, true, scope));
      }
      if (fact?.isFree === false) {
        return result(knownFeeAnswer(kind, false, scope));
      }
      return result(noFeeInformation(kind, true, scope));
    }

    if (asksFeeStatus) {
      const feePolicy = policy.filter(policyStatesFee);
      if (feePolicy.length) return result(feePolicy.join(' '));
      if (!fact || fact.isFree === null) return result(noFeeInformation(kind, false, scope));
      return result(factAnswer(kind, fact));
    }

    if ((kind === 'pets' || kind === 'parking' || scope !== 'generic') && policy.length) {
      return result(policy.join(' '));
    }
    if (!fact) {
      const label = kind === 'wifi'
        ? 'מידע על זמינות Wi-Fi'
        : kind === 'parking'
          ? 'מידע על זמינות חניה'
          : 'מידע על מדיניות חיות מחמד';
      return result(`לא מצאתי במידע הזמין של המלון ${label}.`);
    }
    return result(factAnswer(kind, fact, scope));
  }
  if (reviews) return result(reviewAnswer(mapped), 'guest-reviews');
  return null;
}
