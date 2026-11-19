import { createHotelMap } from './hotel-map/mapbox-map.js';

const HOTEL_IDS = new Set([
  '14640478', '22362808', '17690826', '4046285',
  '6895127', '4645325', '11165062', '4458386'
]);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const text = (node, value) => { if (node) node.textContent = value == null ? '' : String(value); };
const clear = node => { if (node) node.replaceChildren(); };
const el = (tag, className, value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = String(value);
  return node;
};
const numberOrNull = value => {
  if (value == null || (typeof value === 'string' && !value.trim()) || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

let hotelSummaries = [];
let currentHotel = null;
let currentHotelId = null;
let defaultHotelId = '4458386';
let loadSequence = 0;
let chatSequence = 0;
let chatPending = false;
let activeAskController = null;
let aiState = { available: false, reason: '' };
let galleryImages = [];
let roomPhotoSets = new WeakMap();
let activeRoom = null;
let activeRoomPhotos = [];
let activePopupPhoto = 0;
let lastGalleryFocus = null;
let lastFacilityFocus = null;
let lastRoomFocus = null;
let lastMapFocus = null;
let lastChatFocus = null;
let activeFacilityGroup = null;
let modalStack = [];
let statusNode = null;
let hotelListNode = null;
let mobileHotelListNode = null;
let locationDropdownOpen = false;
let facilityGroups = [];
const roomCardTemplate = $('.room-card')?.cloneNode(true) || null;
const suggestionFootTemplates = $$('.suggestion-card__foot').map(foot => foot.cloneNode(true));
const hotelMap = createHotelMap($('#hotel-map'));
let conversationMessages = [];

function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function scalarText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    for (const key of ['text', 'name', 'value', 'description', 'title']) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
    }
  }
  return '';
}

function textItems(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.map(scalarText).filter(Boolean);
}

function normalizedImages(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const url = safeHttpUrl(item.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{
      url,
      alt: scalarText(item.alt),
      category: scalarText(item.category),
      id: scalarText(item.id)
    }];
  });
}

function safeHotelList(payload) {
  const source = payload && Array.isArray(payload.hotels) ? payload.hotels : [];
  return source.filter(item => item && HOTEL_IDS.has(String(item.id))).map(item => ({
    id: String(item.id),
    name: scalarText(item.name),
    city: scalarText(item.city),
    stars: numberOrNull(item.stars),
    image: safeHttpUrl(item.image),
    score: numberOrNull(item.score),
    available: item.available !== false,
    error: scalarText(item.error)
  }));
}

function createStatus() {
  statusNode = el('div', 'hotel-app-status');
  statusNode.id = 'hotel-app-status';
  statusNode.setAttribute('role', 'status');
  statusNode.setAttribute('aria-live', 'polite');
  statusNode.hidden = true;
  const anchor = $('.search-summary');
  if (anchor) anchor.before(statusNode);
}

function setStatus(message, kind = 'info') {
  if (!statusNode) createStatus();
  text(statusNode, message);
  statusNode.dataset.kind = kind;
  statusNode.hidden = !message;
}

function setReady() {
  document.documentElement.dataset.appReady = 'true';
}

function lockScroll() {
  document.body.style.overflow = modalStack.length || !$('#gallery-lightbox').hidden ? 'hidden' : '';
}

function openManagedModal(root, focusTarget, onClose) {
  if (!root) return;
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  root.__onManagedClose = onClose || null;
  if (!modalStack.includes(root)) modalStack.push(root);
  lockScroll();
  requestAnimationFrame(() => {
    const target = focusTarget || root.querySelector('button, input, [tabindex]:not([tabindex="-1"])');
    if (target && target.focus) target.focus();
  });
}

function closeManagedModal(root) {
  if (!root || root.hidden) return;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  modalStack = modalStack.filter(item => item !== root);
  lockScroll();
  if (typeof root.__onManagedClose === 'function') root.__onManagedClose();
  root.__onManagedClose = null;
}

function closeSharedLightbox() {
  const lightbox = $('#gallery-lightbox');
  if (!lightbox || lightbox.hidden) return;
  const closeButton = lightbox.querySelector('[data-lb-close]');
  if (closeButton) closeButton.click();
}

function visibleFocusable(root) {
  return $$('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])', root)
    .filter(node => !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length);
}

document.addEventListener('keydown', event => {
  const lightbox = $('#gallery-lightbox');
  const topModal = modalStack[modalStack.length - 1];
  const active = lightbox && !lightbox.hidden ? lightbox : topModal;
  if (!active) return;
  if (event.key === 'Escape') {
    if (lightbox && !lightbox.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    closeManagedModal(topModal);
    return;
  }
  if (event.key !== 'Tab') return;
  const focusables = visibleFocusable(active);
  if (!focusables.length) {
    event.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === active)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}, true);

function showAndReturnFocus(root, focus) {
  closeManagedModal(root);
  if (focus && focus.isConnected && focus.focus) focus.focus();
}

function getLocationAddress(location = {}) {
  return [scalarText(location.address), scalarText(location.city), scalarText(location.countryCode)]
    .filter(Boolean).join(', ');
}

function setStars(root, value) {
  if (!root) return;
  clear(root);
  const amount = Math.max(0, Math.min(5, Math.floor(numberOrNull(value) || 0)));
  root.hidden = amount === 0;
  root.setAttribute('aria-label', amount ? `${amount} כוכבים` : '');
  for (let i = 0; i < amount; i++) {
    const image = el('img');
    image.src = 'assets/star.svg';
    image.alt = '';
    root.append(image);
  }
}

function setRatingBadge(score) {
  const badges = $('.hotel-title__badges');
  if (!badges) return;
  clear(badges);
  const value = numberOrNull(score);
  if (value == null || value < 0 || value > 10) return;
  const rating = el('span', 'hotel-title__rating');
  const label = el('span', 'hotel-title__rating-label', 'דירוג אורחים');
  const scoreNode = el('span', 'hotel-title__rating-score', value.toFixed(1));
  rating.append(label, scoreNode);
  badges.append(rating);
}

function attachDemoLabel(root, extraClass = '') {
  if (!root || $('.demo-commercial-note', root)) return;
  const label = el('p', `demo-commercial-note ${extraClass}`.trim(),
    'מחירי הדגמה והצעות להמחשה בלבד — לא מתבצעת כאן הזמנה או סליקה.');
  root.prepend(label);
}

function setupCommercialLabels() {
  $$('.hotel-title__price-note').forEach(note => {
    if (!/הדגמה/.test(note.textContent)) note.append(document.createTextNode(' · הדגמה בלבד'));
  });
  text($('.flight-banner__sub'), 'מחיר הדגמה בלבד — ללא הזמנה או סליקה.');
  text($('.hotel-title__package'), 'הצעת חבילה להדגמה בלבד');
  text($('.flight-banner__title'), 'אפשרות טיסה — להדגמה בלבד');
  $$('.search-summary__submit, .stay-modify__submit').forEach(button => text(button, 'עדכון הדגמה'));
  attachDemoLabel($('.room-selection__main'));
  const suggestionsTitle = $('.hotel-suggestions__title');
  text(suggestionsTitle, 'מלונות שיכולים לעניין אותך');
  const suggestions = $('.hotel-suggestions__inner');
  if (suggestions && !$('.hotel-suggestions__title-note', suggestions)) {
    const note = el('p', 'hotel-suggestions__title-note',
      'המחירים, התאריכים והרכב האורחים להמחשה בלבד. הכפתורים מציגים פרטי מלון ואינם מבצעים הזמנה.');
    suggestionsTitle?.after(note);
  }
  $$('.filter-chip').forEach(chip => {
    chip.textContent = chip.textContent.replace(/\s*\(\d+\)\s*/g, '').trim();
    chip.setAttribute('aria-pressed', String(chip.classList.contains('filter-chip--active')));
  });
  $$('.room-option .cheapest-badge').forEach(badge => badge.remove());
  $$('.room-card__confirm').forEach(badge => { badge.hidden = true; });
  $$('.tax-details__note').forEach(note => {
    text(note, 'פירוט הדגמה בלבד; סכומים ותנאים אינם הצעה להזמנה.');
  });
  const termsText = $('.tax-details__variant[data-tax-variant="terms"] .tax-details__text');
  if (termsText) text(termsText, 'תנאי הדגמה בלבד. אין כאן הצעת הזמנה או התקשרות עם המלון.');
  const termsTitle = $('#tax-terms .tax-terms__title');
  if (termsTitle && !$('.tax-terms__demo-note')) {
    const note = el('p', 'tax-terms__demo-note',
      'מיסים ותנאי ביטול להדגמה בלבד — אינם תנאי המלון או הצעת הזמנה.');
    termsTitle.after(note);
  }
}

function prepareLocationSelector() {
  const dropdown = $('.ss-dd');
  hotelListNode = $('.ss-dd__list');
  mobileHotelListNode = $('[data-mobile-hotels]');
  const button = $('.search-summary__location');
  const input = $('.ss-dd__input');
  if (!dropdown || !hotelListNode || !button) return;
  button.setAttribute('aria-controls', 'hotel-selector-list');
  hotelListNode.id = 'hotel-selector-list';
  text($('.ss-dd__title'), 'בחירת מלון מתוך רשימת ההדגמה');
  text($('.ss-dd__here'), 'נבחר');
  if (input) input.placeholder = 'חיפוש לפי שם מלון או יעד';
  button.addEventListener('click', () => {
    locationDropdownOpen = dropdown.hidden;
    dropdown.hidden = !locationDropdownOpen;
    button.setAttribute('aria-expanded', String(locationDropdownOpen));
    if (locationDropdownOpen) {
      input?.focus();
      input?.select();
    }
  });
  input?.addEventListener('input', () => filterHotelOptions(input.value));
  hotelListNode.addEventListener('click', event => {
    const choice = event.target.closest('[data-hotel-id]');
    if (!choice) return;
    selectHotel(choice.dataset.hotelId, true);
    closeLocationSelector();
  });
  mobileHotelListNode?.addEventListener('click', event => {
    const choice = event.target.closest('[data-hotel-id]');
    if (!choice) return;
    const id = choice.dataset.hotelId;
    closeMobileHotelMenu(true);
    selectHotel(id, true);
  });
  document.addEventListener('click', event => {
    if (locationDropdownOpen && !event.target.closest('.search-summary__loc')) closeLocationSelector();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && locationDropdownOpen) {
      event.preventDefault();
      closeLocationSelector(true);
    }
  });
}

function closeLocationSelector(returnFocus = false) {
  const dropdown = $('.ss-dd');
  const button = $('.search-summary__location');
  if (dropdown) dropdown.hidden = true;
  button?.setAttribute('aria-expanded', 'false');
  locationDropdownOpen = false;
  if (returnFocus) button?.focus();
}

function filterHotelOptions(value) {
  const query = String(value || '').trim().toLocaleLowerCase();
  $$('.ss-dd__list [data-hotel-id]').forEach(option => {
    option.closest('li').hidden = !`${option.dataset.search || ''}`.toLocaleLowerCase().includes(query);
  });
}

function renderHotelOptions() {
  if (hotelListNode) clear(hotelListNode);
  if (mobileHotelListNode) clear(mobileHotelListNode);
  hotelSummaries.forEach(hotel => {
    const label = `${hotel.name || 'מלון'}${hotel.city ? ` — ${hotel.city}` : ''}`;
    if (hotelListNode) {
      const li = el('li');
      const button = el('button', 'ss-dd__dest', label);
      button.type = 'button';
      button.dataset.hotelId = hotel.id;
      button.dataset.search = `${hotel.name} ${hotel.city} ${hotel.id}`;
      button.setAttribute('aria-current', hotel.id === currentHotelId ? 'true' : 'false');
      li.append(button);
      hotelListNode.append(li);
    }
    if (mobileHotelListNode) {
      const li = el('li');
      const button = el('button', 'mobile-hotel-selector__button', label);
      button.type = 'button';
      button.dataset.hotelId = hotel.id;
      button.setAttribute('aria-current', hotel.id === currentHotelId ? 'true' : 'false');
      li.append(button);
      mobileHotelListNode.append(li);
    }
  });
}

function closeMobileHotelMenu(returnFocus = false) {
  const header = $('.site-header__inner');
  const trigger = $('.site-header__hamburger');
  header?.classList.remove('is-menu-open');
  trigger?.setAttribute('aria-expanded', 'false');
  if (returnFocus) trigger?.focus();
}

function updateSelectedHotelLabel(hotel) {
  const label = [hotel?.name, hotel?.city].filter(Boolean).join(', ') || 'בחירת מלון';
  text($('.search-summary__location .search-summary__text'), label);
  text($('.ss-dd__cur-name'), hotel?.name || 'בחירת מלון');
  $$('.ss-dd__list [data-hotel-id]').forEach(option => {
    option.setAttribute('aria-current', String(option.dataset.hotelId === hotel?.id));
  });
}

function showEmpty(parent, message, className = 'hotel-empty-state') {
  if (!parent) return;
  const tag = parent.tagName === 'UL' || parent.tagName === 'OL' ? 'li' : 'p';
  const empty = el(tag, className, message);
  if (parent.getAttribute('role') === 'list') empty.setAttribute('role', 'listitem');
  parent.append(empty);
}

function categoryKey(value) {
  const v = String(value || '').trim().toLocaleLowerCase().replace(/[\s-]+/g, '_');
  const exact = {
    room: 'room', guest_room: 'room', bedroom: 'room', guestroom: 'room',
    bathroom: 'bathroom', bath: 'bathroom', bath_room: 'bathroom',
    conference_room: 'events', meeting_room: 'events', living_room: 'lounge',
    food_and_drink: 'food', food_beverage: 'food', food_and_beverage: 'food',
    pool: 'pool', swimming_pool: 'pool', aqua_park: 'pool', spa: 'spa', terrace: 'terrace',
    lobby: 'lobby', reception: 'lobby', fitness: 'fitness', exterior: 'exterior'
  };
  if (exact[v]) return exact[v];
  const rules = [
    ['bathroom', /bath|חדר_רחצה|אמבט/], ['events', /conference|meeting|event|כנס|אירוע/],
    ['lounge', /living_room|lounge|sitting|ישיבה|סלון/],
    ['food', /food|restaurant|dining|beverage|מזון|מסעד|אוכל|משקאות/],
    ['view', /view|נוף/], ['spa', /spa|wellness|health|ספא|וולנס|בריאות/],
    ['pool', /pool|swim|בריכ|חוף/], ['kids', /kid|child|ילד/],
    ['lobby', /lobby|reception|לובי|קבלה/], ['interior', /interior|פנים/],
    ['terrace', /terrace|balcony|מרפסת|טרסה/], ['fitness', /fitness|sport|כושר|ספורט/],
    ['exterior', /exterior|outside|חיצוני/], ['room', /(?:^|_)room(?:$|_)|bedroom|חדר(?:_שינה)?/]
  ];
  const match = rules.find(([, regex]) => regex.test(v));
  return match ? match[0] : 'other';
}

function findCategoryImage(category, images, usedUrls = new Set()) {
  const key = categoryKey(category);
  if (key === 'other') return null;
  return images.find(image => (
    !usedUrls.has(image.url) && categoryKey(image.category) === key
  )) || null;
}

function findCategoryImages(category, images) {
  const key = categoryKey(category);
  if (key === 'other') return [];
  return images.filter(image => categoryKey(image.category) === key);
}

const FACILITY_ICON_LABELS = new Map([
  ['אוכל ושתייה', 'food'], ['בריכות וחוף', 'pool'], ['וולנס וספא', 'spa'],
  ['משפחות וילדים', 'kids'], ['ספורט ופעילויות', 'fitness'],
  ['בידור וחיי לילה', 'nightlife'], ['שירות וקבלה', 'lobby'],
  ['עסקים וכנסים', 'events'], ['מיקום והגעה', 'location']
]);
const FACILITY_ICON_ALIASES = new Map([
  ['food', 'food'], ['food_and_drink', 'food'], ['food_and_beverage', 'food'], ['food_beverage', 'food'],
  ['pool', 'pool'], ['pools', 'pool'], ['swimming_pool', 'pool'], ['pools_and_beach', 'pool'],
  ['spa', 'spa'], ['wellness', 'spa'], ['wellness_and_spa', 'spa'], ['leisure_and_wellness', 'spa'],
  ['kids', 'kids'], ['family', 'kids'], ['family_and_kids', 'kids'], ['families_and_children', 'kids'],
  ['fitness', 'fitness'], ['sport', 'fitness'], ['sports', 'fitness'], ['sport_and_activities', 'fitness'],
  ['nightlife', 'nightlife'], ['entertainment', 'nightlife'], ['entertainment_and_nightlife', 'nightlife'],
  ['service', 'lobby'], ['services', 'lobby'], ['services_and_reception', 'lobby'],
  ['facilities_and_services', 'lobby'], ['מתקנים_ושירותים', 'lobby'],
  ['room_bedding', 'bed'], ['מיטות_ואבזור_שינה', 'bed'],
  ['room_outdoor', 'outdoor'], ['מרפסות_ושטחי_חוץ', 'outdoor'],
  ['business', 'events'], ['business_and_conferences', 'events'], ['conferences', 'events'],
  ['location', 'location'], ['location_and_access', 'location'], ['access', 'location'],
  ['בידור_וחיי_לילה', 'nightlife'], ['מיקום_והגעה', 'location']
]);
const facilityIconTemplates = new Map();
$$('.facilities__track [data-fac-icon]').forEach(icon => {
  const label = icon.closest('.fac-card__title')?.textContent.trim();
  const key = FACILITY_ICON_LABELS.get(label);
  const svg = $('svg', icon);
  if (key && svg) facilityIconTemplates.set(key, svg.cloneNode(true));
});
const bedIconTemplate = $('.hotel-map__hotel-badge svg');
if (bedIconTemplate) facilityIconTemplates.set('bed', bedIconTemplate.cloneNode(true));

// Capture the original mock icons before clearHotelData removes their rows.
const policyIconTemplates = new Map($$('.hotel-know__item').map(item => [
  $('.hotel-know__label', item)?.textContent.trim(),
  $('.hotel-know__icon', item)?.cloneNode(true)
]).filter(([label, icon]) => label && icon));
const reviewIconTemplates = new Map([
  [true, $('.reviews__pt--good svg.reviews__ic')?.cloneNode(true)],
  [false, $('.reviews__pt--bad svg.reviews__ic')?.cloneNode(true)]
]);

const SUPPLEMENTAL_ICON_PATHS = new Map([
  ['outdoor', 'M4 13h16M4 20h16M6 13v7m4-7v7m4-7v7m4-7v7M7 10V4h10v6M12 4v6'],
  ['guests', 'M12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2'],
  ['policy', 'M14 3H5v18h14V8l-5-5v5h5M8 12h8M8 16h8'],
  ['house', 'M3 11l9-8 9 8M5 10v11h14V10M9 15l2 2 4-4'],
  ['info', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6M12 7h.01']
]);

function facilityIconKey(group) {
  const value = String(group || '').trim().toLocaleLowerCase().replace(/[\s-]+/g, '_');
  const labelKey = FACILITY_ICON_LABELS.get(String(group || '').trim());
  if (labelKey) return labelKey;
  const alias = FACILITY_ICON_ALIASES.get(value);
  if (alias) return alias;
  const key = categoryKey(group);
  return facilityIconTemplates.has(key) ? key : null;
}

const CATEGORY_LABELS = {
  room: 'חדר', food: 'מזון ומשקאות', view: 'נוף', bathroom: 'חדר רחצה',
  spa: 'ספא / רחצה', pool: 'בריכה', lounge: 'סלון / אזור ישיבה',
  kids: 'אזורי ילדים', lobby: 'לובי וקבלה', interior: 'פנים המלון',
  terrace: 'מרפסת / טרסה', fitness: 'פעילויות וכושר',
  events: 'כנסים ואירועים', exterior: 'מראה חיצוני', other: 'אחר'
};

function localizedFacilityGroup(value) {
  const original = scalarText(value);
  const key = original.toLocaleLowerCase().replace(/[&-]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_');
  const labels = {
    facilities_and_services: 'מתקנים ושירותים',
    food_and_drink: 'אוכל ושתייה',
    food_drink: 'אוכל ושתייה',
    food_and_beverage: 'אוכל ושתייה',
    leisure_and_wellness: 'פנאי ובריאות',
    leisure_wellness: 'פנאי ובריאות',
    room_bedding: 'מיטות ואבזור שינה',
    room_outdoor: 'מרפסות ושטחי חוץ'
  };
  return labels[key] || original || 'מתקנים ושירותים';
}

function renderGallery(hotel) {
  galleryImages = normalizedImages(hotel.images);
  const grid = $('.hotel-gallery__grid');
  $$('.hotel-empty-state', grid).forEach(node => node.remove());
  const cells = $$('.hotel-gallery__cell', grid);
  cells.forEach((cell, index) => {
    clear(cell);
    const image = galleryImages[index];
    cell.hidden = !image;
    if (!image) return;
    cell.dataset.index = String(index);
    const img = el('img');
    img.src = image.url;
    img.alt = image.alt;
    img.loading = index < 4 ? 'eager' : 'lazy';
    cell.append(img);
    cell.setAttribute('aria-label', image.alt || `פתיחת תמונה ${index + 1}`);
  });
  const counter = $('.hotel-gallery__counter');
  text($('.hotel-gallery__counter-num'), galleryImages.length);
  if (counter) {
    counter.hidden = galleryImages.length === 0;
    counter.setAttribute('aria-label', `פתיחת גלריית תמונות, ${galleryImages.length} תמונות`);
  }
  if (!galleryImages.length) showEmpty(grid, 'תמונות המלון אינן זמינות כרגע.');
  renderGalleryCategories();
}

function renderGalleryCategories() {
  const root = $('#gallery-categories');
  const tablist = $('[data-gc-tablist]', root);
  const grid = $('[data-gc-grid]', root);
  if (!root || !tablist || !grid) return;
  clear(tablist);
  clear(grid);
  const categories = [...new Set(galleryImages.map(image => categoryKey(image.category)))];
  const tabs = [{ key: 'all', label: 'כל התמונות' }, ...categories.map(key => ({ key, label: CATEGORY_LABELS[key] }))];
  tabs.forEach((category, index) => {
    const tab = el('button', `gallery-categories__tab${index === 0 ? ' is-active' : ''}`, category.label);
    tab.type = 'button';
    tab.dataset.gcTab = category.key;
    tab.setAttribute('aria-pressed', String(index === 0));
    tablist.append(tab);
  });
  galleryImages.forEach((image, index) => {
    const cell = el('button', 'gallery-categories__cell');
    cell.type = 'button';
    cell.dataset.cat = categoryKey(image.category);
    cell.dataset.galleryIndex = String(index);
    cell.setAttribute('aria-label', image.alt || `פתיחת תמונה ${index + 1}`);
    const img = el('img');
    img.src = image.url;
    img.alt = image.alt;
    img.loading = 'lazy';
    cell.append(img);
    grid.append(cell);
  });
  text($('[data-gc-count]', root), galleryImages.length);
  if (!galleryImages.length) showEmpty(grid, 'תמונות המלון אינן זמינות כרגע.');
  updateGalleryTabArrows();
}

function updateGalleryTabArrows() {
  const root = $('#gallery-categories');
  const tablist = $('[data-gc-tablist]', root);
  if (!tablist) return;
  const max = Math.max(0, tablist.scrollWidth - tablist.clientWidth);
  const scrolled = Math.abs(tablist.scrollLeft);
  const left = $('[data-gc-scroll="left"]', root);
  const right = $('[data-gc-scroll="right"]', root);
  if (left) left.hidden = max <= 2 || scrolled >= max - 2;
  if (right) right.hidden = max <= 2 || scrolled <= 2;
}

function openGalleryCategories(index = 0) {
  if (!galleryImages.length) {
    setStatus('תמונות המלון אינן זמינות כרגע.', 'error');
    return;
  }
  const root = $('#gallery-categories');
  lastGalleryFocus = document.activeElement;
  const tablist = $('[data-gc-tablist]', root);
  const allTab = $('[data-gc-tab="all"]', root);
  $$('.gallery-categories__tab', tablist).forEach(tab => {
    tab.classList.toggle('is-active', tab === allTab);
    tab.setAttribute('aria-pressed', String(tab === allTab));
  });
  $$('.gallery-categories__cell', root).forEach(cell => { cell.hidden = false; });
  openManagedModal(root, $('.gallery-categories__close', root), () => {
    if (lastGalleryFocus?.isConnected) lastGalleryFocus.focus();
  });
  root.dataset.requestedIndex = String(index);
}

function openLightbox(images, index, trigger) {
  const set = (images || []).filter(image => safeHttpUrl(image.url)).map(image => ({
    src: safeHttpUrl(image.url),
    alt: scalarText(image.alt)
  }));
  if (!set.length) return;
  let focusTarget = trigger;
  if (trigger?.classList?.contains('room-gallery')) focusTarget = $('.room-gallery__counter', trigger) || trigger;
  if (trigger?.classList?.contains('room-popup__media')) focusTarget = $('.room-popup__counter', trigger) || trigger;
  if (focusTarget && focusTarget.focus) focusTarget.focus();
  document.dispatchEvent(new CustomEvent('gallery-lightbox:open', {
    detail: { index: Math.max(0, Math.min(set.length - 1, Number(index) || 0)), photos: set }
  }));
}

function renderAbout(hotel) {
  const about = $('[data-about-text]');
  clear(about);
  $('.about-hotel__source-note')?.remove();
  about?.classList.add('about-hotel__desc--clamped');
  const aboutButton = $('[data-about-toggle]');
  const aboutActions = aboutButton?.closest('.about-hotel__actions');
  if (aboutButton) {
    aboutButton.setAttribute('aria-expanded', 'false');
    text(aboutButton, 'לראות עוד');
  }
  if (aboutActions) aboutActions.hidden = false;
  const summary = scalarText(hotel.summary);
  if (!summary) {
    showEmpty(about, 'תיאור המלון אינו זמין כרגע.', 'hotel-page-section-state');
    if (aboutActions) aboutActions.hidden = true;
    return;
  }
  const paragraph = el('p', 'about-hotel__text');
  appendInlineMarkdown(paragraph, summary);
  about.append(paragraph);
  const sourceNote = el('p', 'about-hotel__source-note',
    'תיאור שנוצר על ידי AI על בסיס מידע המלון בנתוני YGO.');
  about.after(sourceNote);
  requestAnimationFrame(() => {
    if (aboutActions && about) aboutActions.hidden = about.scrollHeight <= about.clientHeight + 1;
  });
}

function appendInlineMarkdown(parent, value) {
  const source = String(value || '');
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let start = 0;
  let match;
  while ((match = pattern.exec(source))) {
    if (match.index > start) parent.append(document.createTextNode(source.slice(start, match.index)));
    const formatted = el(match[2] ? 'strong' : 'em', null, match[2] || match[3]);
    parent.append(formatted);
    start = pattern.lastIndex;
  }
  if (start < source.length) parent.append(document.createTextNode(source.slice(start)));
}

function appendSafeMarkdown(parent, value) {
  const lines = String(value || '').split(/\r?\n/);
  let list = null;
  lines.forEach(line => {
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      if (!list) {
        list = el('ul');
        parent.append(list);
      }
      const item = el('li');
      appendInlineMarkdown(item, bullet[1]);
      list.append(item);
      return;
    }
    list = null;
    if (!line.trim()) return;
    const paragraph = el('span');
    appendInlineMarkdown(paragraph, line.trim());
    parent.append(paragraph, document.createTextNode(' '));
  });
}

function renderHighlights(hotel) {
  const list = $('.advantages__list');
  clear(list);
  list?.classList.remove('is-expanded');
  const more = $('[data-adv-toggle]');
  if (more) {
    more.setAttribute('aria-expanded', 'false');
    text(more, 'לראות עוד');
  }
  const highlights = Array.isArray(hotel.highlights) ? hotel.highlights : [];
  const usable = highlights.filter(item => item && (scalarText(item.title) || scalarText(item.text)));
  if (!usable.length) {
    showEmpty(list, 'יתרונות המלון אינם זמינים כרגע.', 'hotel-page-section-state');
    return;
  }
  usable.forEach(item => {
    const li = el('li', 'advantages__item');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'advantages__check');
    icon.setAttribute('viewBox', '0 0 20 20');
    icon.setAttribute('aria-hidden', 'true');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '10'); circle.setAttribute('cy', '10'); circle.setAttribute('r', '9');
    circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', '#2aae54'); circle.setAttribute('stroke-width', '1.4');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 10.4l2.6 2.6 5.2-5.6');
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#2aae54'); path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
    icon.append(circle, path);
    const content = el('span', 'advantages__text');
    const title = scalarText(item.title);
    if (title) {
      const strong = el('strong');
      appendInlineMarkdown(strong, title);
      content.append(strong);
      if (scalarText(item.text)) content.append(document.createTextNode(' — '));
    }
    appendSafeMarkdown(content, item.text);
    li.append(icon, content);
    list.append(li);
  });
}

function facilityName(facility) {
  return scalarText(facility && facility.name);
}

function normalizedFacilities(hotel) {
  return (Array.isArray(hotel.facilities) ? hotel.facilities : []).filter(item =>
    item && facilityName(item)).map(item => ({
      key: scalarText(item.key),
      name: facilityName(item),
      group: localizedFacilityGroup(item.group),
      isFree: typeof item.isFree === 'boolean' ? item.isFree : null
    }));
}

function makeCheckIcon(className = 'fac-card__check') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 18 18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 9.2l3 3L14 5.5');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function facilityBadge(isFree) {
  if (isFree == null) return null;
  return el('span', `fac-badge fac-badge--${isFree ? 'free' : 'paid'}`, isFree ? 'חינם' : 'בתשלום');
}

function makeFacilityRow(item, detailed = false) {
  const li = el('li', detailed ? 'fac-item' : 'fac-card__pt');
  if (detailed) {
    const head = el('div', 'fac-item__head');
    head.append(makeCheckIcon('fac-item__check'));
    head.append(el('h3', 'fac-item__name', item.name));
    const badge = facilityBadge(item.isFree);
    if (badge) head.append(badge);
    li.append(head);
  } else {
    li.append(makeCheckIcon(), el('span', 'fac-card__pt-txt', item.name));
    const badge = facilityBadge(item.isFree);
    if (badge) li.append(badge);
  }
  return li;
}

function groupImage(group, images, usedUrls) {
  return findCategoryImage(group, images, usedUrls);
}

function makeSupplementalIcon(kind, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({
    class: className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'
  })) svg.setAttribute(name, value);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', SUPPLEMENTAL_ICON_PATHS.get(kind) || SUPPLEMENTAL_ICON_PATHS.get('info'));
  svg.append(path);
  return svg;
}

function makeFacilityIcon(group) {
  const wrap = el('span', 'fac-card__ic facilities__cat-icon hotel-facility-icon');
  wrap.setAttribute('aria-hidden', 'true');
  const key = facilityIconKey(group);
  const template = facilityIconTemplates.get(key);
  wrap.append(template ? template.cloneNode(true) : makeSupplementalIcon(key));
  return wrap;
}

function renderFacilities(hotel) {
  const track = $('.facilities__track');
  clear(track);
  const viewport = $('.facilities__viewport');
  if (viewport) viewport.scrollLeft = 0;
  facilityGroups = [];
  const grouped = new Map();
  normalizedFacilities(hotel).forEach(item => {
    if (!grouped.has(item.group)) grouped.set(item.group, []);
    grouped.get(item.group).push(item);
  });
  const images = normalizedImages(hotel.images);
  const usedImageUrls = new Set();
  Array.from(grouped.entries()).forEach(([name, items], index) => {
    const group = {
      key: `hotel-facility-${index}`,
      name,
      items,
      photos: findCategoryImages(name, images)
    };
    facilityGroups.push(group);
    const slide = el('li', 'facilities__slide');
    const card = el('article', 'fac-card');
    const image = groupImage(name, images, usedImageUrls);
    if (image) {
      usedImageUrls.add(image.url);
      const media = el('div', 'fac-card__media hotel-facility-preview');
      const img = el('img', 'fac-card__img');
      img.src = image.url; img.alt = image.alt; img.loading = 'lazy';
      media.append(img);
      card.append(media);
    }
    const body = el('div', 'fac-card__body');
    const title = el('h3', 'fac-card__title');
    title.append(makeFacilityIcon(name), document.createTextNode(name));
    const list = el('ul', 'fac-card__pts');
    items.slice(0, 4).forEach(item => list.append(makeFacilityRow(item)));
    const more = el('button', 'fac-card__more', 'הצג את כל המתקנים');
    more.type = 'button';
    more.dataset.facOpen = group.key;
    more.setAttribute('aria-haspopup', 'dialog');
    more.setAttribute('aria-label', `הצגת מתקנים: ${name}`);
    body.append(title, list, more);
    card.append(body);
    slide.append(card);
    track.append(slide);
  });
  if (!facilityGroups.length) showEmpty(track, 'מידע על מתקני המלון אינו זמין כרגע.', 'hotel-empty-state hotel-facility-group-empty');
}

function renderFacilityDialog(group) {
  const modal = $('#fac-modal');
  if (!modal || !group) return;
  activeFacilityGroup = group;
  text($('[data-fac-title]', modal), group.name);
  text($('[data-fac-sub]', modal), `${group.items.length} פריטים בנתוני המלון`);
  const intro = $('[data-fac-intro]', modal);
  text(intro, '');
  intro.hidden = true;
  const photoContainer = $('[data-fac-photos]', modal);
  clear(photoContainer);
  photoContainer.classList.remove(
    'fac-photos--n1', 'fac-photos--n2', 'fac-photos--n3', 'fac-photos--n4', 'fac-photos--n5'
  );
  const photos = group.photos || [];
  if (photos.length) {
    photoContainer.classList.add(`fac-photos--n${Math.min(photos.length, 5)}`);
    photos.forEach((photo, index) => {
      const tile = el('button', 'fac-photo');
      tile.type = 'button';
      tile.setAttribute('aria-label', photo.alt || `פתיחת תמונה ${index + 1}`);
      const image = el('img');
      image.src = photo.url;
      image.alt = photo.alt;
      image.loading = 'lazy';
      tile.append(image);
      if (index === 4 && photos.length > 5) {
        const more = el('span', 'fac-photo__more', `+${photos.length - 5}`);
        more.setAttribute('aria-hidden', 'true');
        tile.append(more);
      }
      tile.addEventListener('click', () => openLightbox(photos, index, tile));
      photoContainer.append(tile);
    });
  }
  const list = $('[data-fac-list]', modal);
  clear(list);
  group.items.forEach(item => list.append(makeFacilityRow(item, true)));
}

function renderLocation(hotel) {
  const location = hotel.location || {};
  const address = getLocationAddress(location);
  text($('.hotel-location__address'), address || 'הכתובת אינה זמינה כרגע.');
  const pin = $('.hotel-location__pin img');
  if (pin) {
    const image = normalizedImages(hotel.images)[0];
    if (image) { pin.src = image.url; pin.alt = image.alt || hotel.name; }
    else { pin.removeAttribute('src'); pin.alt = ''; }
  }
  const nearby = $('.hotel-location__list');
  clear(nearby);
  const places = Array.isArray(hotel.pois) ? hotel.pois.filter(place => place && scalarText(place.name)) : [];
  places.forEach(place => {
    const li = el('li', 'hotel-location__place');
    const name = el('span', 'hotel-location__place-name');
    const pinIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pinIcon.setAttribute('class', 'hotel-location__place-pin');
    pinIcon.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#hl-pin');
    pinIcon.append(use);
    name.append(pinIcon, document.createTextNode(scalarText(place.name)));
    const distance = numberOrNull(place.distanceMeters);
    const formattedDistance = distance == null || distance < 0 ? 'מרחק לא צוין' :
      distance >= 1000 ? `${(distance / 1000).toLocaleString('he-IL', { maximumFractionDigits: 1 })} ק״מ` :
        `${Math.round(distance)} מטר`;
    li.append(name, el('span', 'hotel-location__place-dist', formattedDistance));
    nearby.append(li);
  });
  nearby.classList.toggle('hotel-location__list--clamped', places.length > 6);
  const more = $('[data-toggle-places]');
  if (more) {
    more.hidden = places.length <= 6;
    more.style.display = places.length <= 6 ? 'none' : '';
    more.setAttribute('aria-expanded', 'false');
    text(more, '+ עוד מקומות');
  }
  if (!places.length) showEmpty(nearby, 'מקומות סמוכים אינם זמינים כרגע.');
  text($('.hotel-location__disclaimer'), '* תצוגת המפה אינה באחריות חברת איסתא אלא מוצגת כשירות בלבד. מומלץ לבדוק ולוודא את הכתובת המדויקת מול סוכן הנסיעות או באתר המלון.');
  text($('.hotel-location__all-map'), 'לצפייה על מפה');
}

function renderMap(hotel) {
  const root = $('#hotel-map');
  const title = $('.hotel-map__title bdi', root);
  text(title, hotel.name || 'מלון');
  hotelMap.setHotel(hotel);
}

function renderRooms(hotel) {
  const list = $('.room-list');
  if (!list) return;
  clear(list);
  roomPhotoSets = new WeakMap();
  activeRoom = null;
  const rooms = Array.isArray(hotel.rooms) ? hotel.rooms.filter(room => room && scalarText(room.name)) : [];
  if (!rooms.length || !roomCardTemplate) {
    showEmpty(list, 'מידע על חדרי המלון אינו זמין כרגע.', 'hotel-empty-state hotel-room-empty');
    return;
  }
  rooms.forEach((room, index) => {
    const card = roomCardTemplate.cloneNode(true);
    const roomId = scalarText(room.id) || String(index);
    card.dataset.roomId = roomId;
    card.dataset.taxType = 'prices';
    text($('.room-card__name', card), room.name);
    $('.room-card__name', card)?.setAttribute('dir', 'auto');
    const bookit = $('.bookit-mini', card);
    if (bookit) {
      bookit.setAttribute('href', '#demo-prices');
      text($('.bookit-mini__text', bookit), 'מחירי הדגמה בלבד');
    }
    $('.room-card__confirm', card)?.remove();
    $$('.room-option', card).forEach(option => {
      const total = $('.room-option__total', option);
      if (total) text(total, 'סה״כ לתקופה — מחיר הדגמה');
      const order = $('.order-btn', option);
      if (order) {
        order.type = 'button';
        text(order, 'הזמן עכשיו');
        order.dataset.demoAction = 'booking';
      }
    });
    const demo = el('p', 'demo-commercial-note room-card__demo-note',
      'המחירים, בסיס האירוח ותנאי הביטול בכרטיס זה הם נתוני הדגמה בלבד.');
    $('.room-card__header', card)?.after(demo);
    text($('.room-card__disclaimer', card),
      'הסינון חל על הצעות ההדגמה בלבד; פרטי החדר מקורם ב־YGO ולא נבדקת זמינות.');

    const images = normalizedImages(room.images);
    const photoList = images.map(image => ({ url: image.url, alt: image.alt }));
    const gallery = $('.room-gallery', card);
    const front = $('.room-gallery__img', gallery);
    const under = $('.room-gallery__under', gallery);
    roomPhotoSets.set(gallery, photoList);
    if (photoList.length) {
      [front, under].forEach(img => {
        if (!img) return;
        img.src = photoList[0].url;
        img.alt = photoList[0].alt || room.name;
        img.hidden = false;
      });
      gallery.dataset.photoIndex = '0';
      $('.room-gallery__controls', gallery)?.removeAttribute('hidden');
      $('.room-gallery__counter span', gallery)?.replaceChildren(document.createTextNode(String(photoList.length)));
      const counter = $('.room-gallery__counter', gallery);
      if (counter) {
        counter.hidden = false;
        counter.setAttribute('aria-label', `פתיחת ${photoList.length} תמונות החדר`);
      }
    } else {
      front?.removeAttribute('src');
      under?.removeAttribute('src');
      if (front) front.hidden = true;
      if (under) under.hidden = true;
      $('.room-gallery__controls', gallery)?.setAttribute('hidden', '');
      $('.room-gallery__counter', gallery).hidden = true;
      const empty = el('span', 'hotel-room-photo-empty', 'תמונות החדר אינן זמינות.');
      gallery.append(empty);
    }

    const features = textItems(room.facilities);
    const labels = $('.room-facilities__labels', card);
    clear(labels);
    const size = numberOrNull(room.sizeSqm);
    if (size != null && size > 0) labels.append(el('span', 'room-facilities__chip', `${size} מ״ר`));
    if (features.length) labels.append(el('span', 'room-facilities__chip', features[0]));
    text($('.room-facilities__desc-text', card), scalarText(room.description) || 'תיאור החדר אינו זמין כרגע.');
    const beddings = Array.isArray(room.beddings) ? room.beddings
      .map(option => textItems(option).join(' / ')).filter(Boolean) : [];
    const beds = $('.room-facilities__beds', card);
    clear(beds);
    if (beddings.length) {
      beds.append(el('strong', null, 'מיטות: '), document.createTextNode(beddings.join(' או ')));
    } else {
      beds.hidden = true;
    }
    $('.room-facilities__more', card)?.setAttribute('aria-label', `מידע נוסף על ${room.name}`);
    card.__hotelRoom = {
      id: roomId,
      name: scalarText(room.name),
      description: scalarText(room.description),
      sizeSqm: size,
      beddings,
      facilities: features,
      images: photoList
    };
    list.append(card);
  });
  applyRoomFilters();
}

function applyRoomFilters() {
  const list = $('.room-list');
  if (!list) return;
  $('.hotel-room-filter-empty', list)?.remove();
  const cards = $$('.room-card', list);
  if (!cards.length) return;
  const selected = $$('.room-filters .filter-chip[aria-pressed="true"]');
  const bases = selected.map(chip => chip.dataset.demoBasis).filter(Boolean);
  const refundable = selected.some(chip => chip.dataset.demoRefundable === 'true');
  let visibleCards = 0;
  cards.forEach(card => {
    const options = $$('.room-option', card);
    options.forEach(option => {
      option.hidden = (bases.length > 0 && !bases.includes(option.dataset.demoBasis)) ||
        (refundable && option.dataset.demoRefundable !== 'true');
    });
    let hasVisibleOption = false;
    options.forEach(option => {
      const divider = option.nextElementSibling;
      if (divider?.classList.contains('room-option__divider')) divider.hidden = true;
      if (!option.hidden) {
        if (hasVisibleOption) {
          const previous = option.previousElementSibling;
          if (previous?.classList.contains('room-option__divider')) previous.hidden = false;
        }
        hasVisibleOption = true;
      }
    });
    card.hidden = !hasVisibleOption;
    if (hasVisibleOption) visibleCards++;
  });
  if (!visibleCards) {
    const empty = el('div', 'hotel-empty-state hotel-room-empty hotel-room-filter-empty');
    empty.setAttribute('role', 'status');
    empty.append(el('p', null, 'אין הצעות הדגמה התואמות לסינון שנבחר. זו אינה בדיקת זמינות חדרים.'));
    const reset = el('button', 'filter-chip', 'ניקוי הסינון');
    reset.type = 'button';
    reset.dataset.clearRoomFilters = '';
    empty.append(reset);
    list.append(empty);
  }
}

function clearRoomFilters() {
  $$('.room-filters .filter-chip').forEach(chip => {
    chip.classList.remove('filter-chip--active');
    chip.setAttribute('aria-pressed', 'false');
  });
  applyRoomFilters();
}

function updateRoomDialog(room, trigger) {
  if (!room) return;
  activeRoom = room;
  activeRoomPhotos = room.images || [];
  activePopupPhoto = 0;
  const popup = $('#room-popup');
  text($('.room-popup__title', popup), room.name);
  $('.room-popup__title', popup)?.setAttribute('dir', 'auto');
  text($('.room-popup__desc', popup), room.description || 'תיאור החדר אינו זמין כרגע.');
  const highlights = $('.room-popup__highlights', popup);
  clear(highlights);
  if (room.sizeSqm != null) highlights.append(makeRoomHighlight('size.svg', `${room.sizeSqm} מ״ר`));
  room.beddings.forEach(value => highlights.append(makeRoomHighlight('guests.svg', value)));
  const facilities = $('.room-popup__facilities', popup);
  clear(facilities);
  room.facilities.forEach(name => {
    const item = el('div', 'room-popup__facility');
    const icon = el('img');
    icon.src = '../room-selection/assets/icons/basis-coffee.svg';
    icon.alt = '';
    item.append(icon, el('span', null, name));
    facilities.append(item);
  });
  if (!room.facilities.length) showEmpty(facilities, 'מתקני החדר אינם זמינים כרגע.');
  updatePopupImage();
  const closeButton = $('.room-popup__close', popup);
  lastRoomFocus = trigger || document.activeElement;
  openManagedModal(popup, closeButton, () => {
    if (lastRoomFocus?.isConnected) lastRoomFocus.focus();
  });
}

function makeRoomHighlight(iconFile, value) {
  const item = el('div', 'room-popup__hl');
  const icon = el('img');
  icon.src = `../room-selection/assets/icons/${iconFile}`;
  icon.alt = '';
  item.append(icon, el('span', null, value));
  return item;
}

function updatePopupImage() {
  const popup = $('#room-popup');
  const img = $('[data-rp-image]', popup);
  const photos = activeRoomPhotos || [];
  const arrows = $('.room-popup__arrows', popup);
  const counter = $('.room-popup__counter', popup);
  if (arrows) arrows.hidden = photos.length < 2;
  if (counter) counter.hidden = photos.length === 0;
  if (photos.length && img) {
    $('.hotel-room-photo-empty', $('.room-popup__media', popup))?.remove();
    activePopupPhoto = ((activePopupPhoto % photos.length) + photos.length) % photos.length;
    img.src = photos[activePopupPhoto].url;
    img.alt = photos[activePopupPhoto].alt || activeRoom?.name || '';
  } else if (img) {
    img.removeAttribute('src');
    img.alt = 'תמונת החדר אינה זמינה';
    const media = $('.room-popup__media', popup);
    if (!$('.hotel-room-photo-empty', media)) {
      media.append(el('span', 'hotel-room-photo-empty', 'תמונות החדר אינן זמינות.'));
    }
  }
  text($('.room-popup__counter span', popup), photos.length);
}

function renderPolicies(hotel) {
  const list = $('.hotel-know__list');
  clear(list);
  const policies = hotel.policies && typeof hotel.policies === 'object' ? hotel.policies : {};
  const entries = [];
  const checkIn = scalarText(policies.checkIn);
  const checkOut = scalarText(policies.checkOut);
  if (checkIn) entries.push(['קבלת חדרים', checkIn]);
  if (checkOut) entries.push(['החזרת חדרים', checkOut]);
  textItems(policies.guestPolicies).forEach(value => entries.push(['תנאי אורחים', value]));
  textItems(policies.policies).forEach(value => entries.push(['מדיניות המלון', value]));
  textItems(policies.houseRules).forEach(value => entries.push(['כללי הבית', value]));
  normalizedFacilities(hotel).filter(item => /חניה|חנייה|parking|חיית מחמד|חיות מחמד|pets?/i.test(item.name))
    .forEach(item => entries.push([/חניה|חנייה|parking/i.test(item.name) ? 'חניה' : 'חיות מחמד',
      item.name + (item.isFree == null ? '' : item.isFree ? ' — ללא תשלום' : ' — בתשלום')]));
  entries.forEach(([label, value]) => {
    const li = el('li', 'hotel-know__item');
    const templateLabel = label === 'חניה' ? 'חנייה'
      : label === 'חיות מחמד' ? 'מדיניות בע״ח'
        : /ביטול|cancell/i.test(value) ? 'מדיניות ביטולים' : label;
    const supplementalKind = label === 'תנאי אורחים' ? 'guests'
      : label === 'כללי הבית' ? 'house' : 'policy';
    const icon = policyIconTemplates.get(templateLabel)?.cloneNode(true) ||
      makeSupplementalIcon(supplementalKind, 'hotel-know__icon');
    icon.setAttribute('aria-hidden', 'true');
    const body = el('div', 'hotel-know__body');
    body.append(el('span', 'hotel-know__label', label), el('span', 'hotel-know__text', value));
    li.append(icon, body);
    list.append(li);
  });
  if (!entries.length) showEmpty(list, 'מדיניות המלון אינה זמינה כרגע.', 'hotel-page-section-state');
}

function renderExperiences(hotel) {
  const grid = $('.hotel-experiences__grid');
  clear(grid);
  const facilities = normalizedFacilities(hotel);
  const groups = new Map();
  facilities.forEach(item => {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  });
  const dining = textItems(hotel.policies && hotel.policies.dining);
  const cards = [];
  if (dining.length) cards.push({ title: 'אוכל ושתייה', text: dining.join(' '), category: 'food' });
  Array.from(groups.entries()).forEach(([name, items]) => {
    const category = categoryKey(name);
    if (category === 'food' && dining.length) return;
    cards.push({
      title: name,
      text: items.map(item => item.name).join(' · '),
      category
    });
  });
  const images = normalizedImages(hotel.images);
  const usedImageUrls = new Set();
  cards.slice(0, 6).forEach((cardData, index) => {
    const card = el('article', 'hotel-experiences__card');
    const imageData = findCategoryImage(cardData.category, images, usedImageUrls);
    const media = el('div', 'hotel-experiences__media');
    if (imageData) {
      usedImageUrls.add(imageData.url);
      const image = el('img');
      image.src = imageData.url; image.alt = imageData.alt; image.loading = 'lazy';
      media.append(image);
    } else {
      media.append(el('span', 'hotel-room-photo-empty', 'תמונה אינה זמינה'));
    }
    card.append(media);
    const body = el('div', 'hotel-experiences__body');
    body.append(el('h3', 'hotel-experiences__h', cardData.title));
    const rule = el('span', 'hotel-experiences__rule');
    rule.setAttribute('aria-hidden', 'true');
    const description = el('div', 'hotel-experiences__p');
    description.id = `hotel-experience-${index}-description`;
    appendSafeMarkdown(description, cardData.text.replace(/(^|\s)#{1,6}\s+/g, '$1'));
    const more = el('button', 'hotel-experiences__more', 'מידע נוסף');
    more.type = 'button';
    more.hidden = true;
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', description.id);
    more.addEventListener('click', () => {
      const expanded = card.classList.toggle('is-expanded');
      more.setAttribute('aria-expanded', String(expanded));
      text(more, expanded ? 'הצג פחות' : 'מידע נוסף');
    });
    body.append(rule, description, more);
    card.append(body);
    grid.append(card);
  });
  if (!cards.length) showEmpty(grid, 'חוויות המלון אינן זמינות כרגע.', 'hotel-page-section-state');
  requestAnimationFrame(updateExperiencePreviews);
}

function updateExperiencePreviews() {
  $$('.hotel-experiences__card').forEach(card => {
    const description = $('.hotel-experiences__p', card);
    const more = $('.hotel-experiences__more', card);
    if (!description || !more || card.classList.contains('is-expanded')) return;
    more.hidden = description.scrollHeight <= description.clientHeight + 1;
  });
}

function reviewLabel(key) {
  const names = {
    service: 'שירות', location: 'מיקום', cleanliness: 'ניקיון', rooms: 'חדרים',
    facilities: 'מתקנים', value: 'תמורה למחיר', food: 'אוכל', comfort: 'נוחות'
  };
  return names[String(key).toLowerCase()] || String(key);
}

function renderReviewList(parent, values, positive) {
  clear(parent);
  const items = textItems(values);
  items.forEach(value => {
    const li = el('li', `reviews__pt ${positive ? 'reviews__pt--good' : 'reviews__pt--bad'}`);
    const icon = reviewIconTemplates.get(positive)?.cloneNode(true) || makeSupplementalIcon('info', 'reviews__ic');
    icon.setAttribute('aria-hidden', 'true');
    li.append(icon, document.createTextNode(value));
    parent.append(li);
  });
  return items.length;
}

function renderReviews(hotel) {
  const rating = hotel.rating && typeof hotel.rating === 'object' ? hotel.rating : null;
  const section = $('.reviews');
  section?.classList.remove('is-expanded');
  const moreButton = $('[data-rev-toggle]', section);
  if (moreButton) {
    moreButton.setAttribute('aria-expanded', 'false');
    text(moreButton, 'לראות עוד');
  }
  const score = rating ? numberOrNull(rating.score) : null;
  if (section) section.hidden = false;
  const validScore = score != null && score >= 0 && score <= 10;
  text($('.reviews__score-num'), validScore ? score.toFixed(1) : '—');
  text($('.reviews__score-max'), '/ 10');
  text($('.reviews__score-note'), validScore
    ? 'דירוג אורחים בנתוני YGO; מספר ביקורות אינו זמין להצגה.'
    : 'דירוג אורחים אינו זמין כרגע.');
  text($('.reviews__summary'), scalarText(rating && rating.summary) || 'סיכום הביקורות אינו זמין כרגע.');
  text($('.reviews__said-title'), 'סיכום ביקורות');
  let generatedNote = $('.reviews__source-note');
  if (!generatedNote) {
    generatedNote = el('p', 'reviews__source-note', 'סיכום ביקורות שנוצר על ידי YGO; אין מדובר בציטוטי אורחים.');
    $('.reviews__said-title')?.after(generatedNote);
  }
  const hasReviewCopy = !!(rating && (scalarText(rating.summary) || textItems(rating.pros).length || textItems(rating.cons).length));
  text(generatedNote, hasReviewCopy
    ? 'סיכום ביקורות שנוצר על ידי AI ב־YGO; אין מדובר בציטוטי אורחים.'
    : 'אין סיכום ביקורות זמין כרגע.');
  const bars = $('.reviews__bars');
  clear(bars);
  const subScores = rating && rating.subScores && typeof rating.subScores === 'object' ? rating.subScores : {};
  Object.entries(subScores).forEach(([key, rawValue]) => {
    const value = numberOrNull(rawValue);
    if (value == null || value < 0 || value > 10) return;
    const li = el('li', 'reviews__bar');
    li.append(el('span', 'reviews__bar-label', reviewLabel(key)));
    li.append(el('span', 'reviews__bar-val', value.toFixed(1)));
    const track = el('span', 'reviews__bar-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = el('span', 'reviews__bar-fill');
    fill.style.width = `${Math.max(0, Math.min(100, value * 10))}%`;
    track.append(fill);
    li.append(track);
    bars.append(li);
  });
  const lists = $('.reviews__lists');
  const columns = $$('.reviews__col', lists);
  if (columns[0]) renderReviewList($('.reviews__pts', columns[0]), rating && rating.pros, true);
  if (columns[1]) renderReviewList($('.reviews__pts', columns[1]), rating && rating.cons, false);
  columns.forEach(column => {
    if (!$('.reviews__pts li', column)) column.hidden = true;
    else column.hidden = false;
  });
  setRatingBadge(validScore ? score : null);
}

function renderSuggestions() {
  const track = $('.hotel-suggestions__track');
  if (!track) return;
  clear(track);
  const viewport = $('.hotel-suggestions__viewport');
  if (viewport) viewport.scrollLeft = 0;
  const otherHotels = hotelSummaries.filter(item => item.id !== currentHotelId);
  otherHotels.forEach(hotel => {
    const slide = el('li', 'hotel-suggestions__slide');
    const card = el('article', 'suggestion-card');
    const media = el('button', 'suggestion-card__media suggestion-card__media--select');
    media.type = 'button';
    media.dataset.hotelId = hotel.id;
    media.setAttribute('aria-label', `הצגת פרטי המלון ${hotel.name || ''}`);
    if (hotel.image) {
      const image = el('img', 'suggestion-card__img');
      image.src = hotel.image; image.alt = hotel.name; image.loading = 'lazy';
      media.append(image);
    } else {
      media.append(el('span', 'hotel-room-photo-empty', 'תמונה אינה זמינה'));
    }
    if (hotel.score != null && hotel.score >= 0 && hotel.score <= 10) {
      const badge = el('span', 'suggestion-card__badge');
      badge.append(el('span', 'suggestion-card__badge-label', 'דירוג אורחים'),
        el('span', 'suggestion-card__score', hotel.score.toFixed(1)));
      media.append(badge);
    }
    const body = el('div', 'suggestion-card__body');
    const details = el('div', 'suggestion-card__details');
    const stars = el('div', 'suggestion-card__stars');
    if (hotel.stars != null) {
      stars.setAttribute('role', 'img');
      stars.setAttribute('aria-label', `${hotel.stars} כוכבים`);
      for (let i = 0; i < Math.max(0, Math.min(5, Math.floor(hotel.stars))); i++) {
        const star = el('img');
        star.src = 'hotel-suggestions/assets/star.svg';
        star.alt = '';
        stars.append(star);
      }
    }
    details.append(stars, el('h3', 'suggestion-card__name', hotel.name || 'מלון'));
    if (hotel.city) details.append(el('p', 'suggestion-card__place', hotel.city));
    body.append(details);
    const demoIndex = [...HOTEL_IDS].indexOf(String(hotel.id));
    const foot = suggestionFootTemplates[demoIndex % suggestionFootTemplates.length].cloneNode(true);
    const templateAction = $('.suggestion-card__cta', foot);
    const action = el('button', 'suggestion-card__cta');
    action.type = 'button';
    action.dataset.hotelId = hotel.id;
    action.setAttribute('aria-label', `הזמן עכשיו — מעבר לפרטי ${hotel.name || 'המלון'}; מחיר הדגמה בלבד`);
    while (templateAction.firstChild) action.append(templateAction.firstChild);
    templateAction.replaceWith(action);
    card.append(media, body, foot);
    slide.append(card);
    track.append(slide);
  });
  if (!otherHotels.length) showEmpty(track, 'אין מלונות נוספים זמינים ברשימה.', 'hotel-empty-state');
}

function updateHotelIdentity(hotel) {
  const name = hotel.name || 'מלון';
  const title = $('.hotel-title__name');
  text(title, hotel.city ? `${name} , ${hotel.city}` : name);
  const heading = `${name}${hotel.city ? `, ${hotel.city}` : ''}`;
  document.title = `ISSTA — ${heading}`;
  setStars($('.hotel-title__stars'), hotel.stars);
  updateSelectedHotelLabel(hotel);
  text($('.hotel-map__title bdi'), name);
}

function clearHotelData() {
  currentHotel = null;
  document.title = 'ISSTA — עמוד מלון';
  const title = $('.hotel-title__name');
  text(title, '');
  setStars($('.hotel-title__stars'), null);
  setRatingBadge(null);
  text($('.search-summary__location .search-summary__text'), '');
  text($('.ss-dd__cur-name'), '');
  galleryImages = [];
  $$('.hotel-gallery__cell', $('.hotel-gallery__grid')).forEach(cell => {
    clear(cell);
    cell.hidden = true;
  });
  const galleryCounter = $('.hotel-gallery__counter');
  text($('.hotel-gallery__counter-num'), '0');
  if (galleryCounter) {
    galleryCounter.hidden = true;
    galleryCounter.setAttribute('aria-label', 'תמונות המלון אינן זמינות כרגע');
  }
  clear($('[data-gc-grid]'));
  clear($('[data-gc-tablist]'));
  text($('[data-gc-count]'), '0');
  const kosherSection = $('.hotel-kosher');
  if (kosherSection) kosherSection.hidden = true;
  clear($('[data-about-text]'));
  $('.about-hotel__source-note')?.remove();
  clear($('.advantages__list'));
  clear($('.facilities__track'));
  clear($('.hotel-location__list'));
  text($('.hotel-location__address'), '');
  text($('.hotel-location__disclaimer'), '');
  const locationPin = $('.hotel-location__pin img');
  locationPin?.removeAttribute('src');
  if (locationPin) locationPin.alt = '';
  hotelMap.setHotel(null);
  text($('.hotel-map__title bdi'), '');
  clear($('[data-map-list]'));
  clear($('.room-list'));
  clear($('.hotel-know__list'));
  clear($('.hotel-experiences__grid'));
  clear($('.reviews__bars'));
  clear($('.reviews__summary'));
  $$('.reviews__pts').forEach(clear);
  renderReviews({ rating: null });
  clear($('.hotel-suggestions__track'));
  clear($('[data-hc-thread]'));
  activeRoom = null;
  conversationMessages = [];
}

function setMissingSections() {
  const message = 'מידע המלון אינו זמין כרגע.';
  showEmpty($('.hotel-gallery__grid'), message);
  showEmpty($('.advantages__list'), message, 'hotel-page-section-state');
  showEmpty($('[data-about-text]'), message, 'hotel-page-section-state');
  showEmpty($('.facilities__track'), message, 'hotel-empty-state');
  showEmpty($('.hotel-location__list'), message);
  showEmpty($('.room-list'), message, 'hotel-empty-state hotel-room-empty');
  showEmpty($('.hotel-know__list'), message, 'hotel-page-section-state');
  showEmpty($('.hotel-experiences__grid'), message, 'hotel-page-section-state');
}

function showInvalidHotelState() {
  ++loadSequence;
  closeSharedLightbox();
  activeAskController?.abort();
  activeAskController = null;
  currentHotelId = null;
  chatSequence++;
  setChatBusy(false);
  $$('[data-hc-form] input, [data-hc-form] button').forEach(control => { control.disabled = true; });
  $$('.hotel-chat [data-hc-q]').forEach(button => button.setAttribute('aria-disabled', 'true'));
  text($('.hotel-chat__note'), 'בחרו מלון מהרשימה כדי לשאול שאלה.');
  text($('.hotel-chat__privacy'), '');
  conversationMessages = [];
  closeLocationSelector();
  modalStack.slice().reverse().forEach(root => closeManagedModal(root));
  clearHotelData();
  setMissingSections();
  renderHotelOptions();
  document.title = 'ISSTA — מלון לא זמין';
  setStatus('מזהה המלון שבקישור אינו נתמך. בחרו אחד משמונת המלונות ברשימה.', 'error');
  setReady();
}

function applyAiState(ai) {
  aiState = {
    available: !!(ai && ai.available === true),
    reason: scalarText(ai && ai.reason)
  };
  const note = $('.hotel-chat__note');
  const badge = $('.hotel-chat__badge');
  const privacy = $('.hotel-chat__privacy');
  if (aiState.available) {
    const notice = 'שאלות ותוכן המלון שנבחר נשלחים ל־YGO לצורך מענה AI.';
    text(note, notice);
    text(privacy, notice);
    note?.setAttribute('data-ai', 'available');
    text(badge, 'תשובת AI · YGO');
  } else {
    const reason = aiState.reason ? ` ${aiState.reason}` : '';
    text(note, `אפשר לשאול שאלות עובדתיות על המלון. שאלות פתוחות אינן זמינות כרגע.${reason}`);
    text(privacy, 'השאלה נשלחת לשרת המקומי כדי להשיב לפי נתוני המלון; אין שליחת פרטי התחברות מהדפדפן.');
    note?.removeAttribute('data-ai');
    text(badge, 'שאלות על נתוני המלון');
  }
}

function renderHotel(hotel, ai) {
  currentHotel = hotel;
  const kosherSection = $('.hotel-kosher');
  if (kosherSection) kosherSection.hidden = String(hotel.id) !== '22362808';
  updateHotelIdentity(hotel);
  applyAiState(ai);
  renderGallery(hotel);
  renderAbout(hotel);
  renderHighlights(hotel);
  renderFacilities(hotel);
  renderLocation(hotel);
  renderMap(hotel);
  renderRooms(hotel);
  renderPolicies(hotel);
  renderExperiences(hotel);
  renderReviews(hotel);
  renderSuggestions();
  document.body.dataset.hotelId = hotel.id;
  setStatus('', 'info');
}

function errorMessage(payload, fallback) {
  return scalarText(payload && payload.error && payload.error.message) || fallback;
}

async function selectHotel(id, updateHistory = false) {
  const hotelId = String(id || '');
  if (!HOTEL_IDS.has(hotelId)) {
    setStatus('המלון המבוקש אינו ברשימת ההדגמה.', 'error');
    return;
  }
  if (updateHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set('hotel', hotelId);
    window.history.pushState({ hotel: hotelId }, '', url);
  }
  closeSharedLightbox();
  const sequence = ++loadSequence;
  currentHotelId = hotelId;
  activeAskController?.abort();
  activeAskController = null;
  chatSequence++;
  setChatBusy(false);
  conversationMessages = [];
  closeLocationSelector();
  modalStack.slice().reverse().forEach(root => closeManagedModal(root));
  const chat = $('#hotel-chat-modal');
  if (chat && !chat.hidden) closeManagedModal(chat);
  clearHotelData();
  renderSuggestions();
  renderHotelOptions();
  setStatus('טוען נתוני מלון…', 'info');
  try {
    const response = await fetch(`/api/hotels/${encodeURIComponent(hotelId)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => null);
    if (sequence !== loadSequence) return;
    if (!response.ok || !payload || !payload.hotel || String(payload.hotel.id) !== hotelId) {
      setMissingSections();
      applyAiState(payload && payload.ai);
      setStatus(errorMessage(payload, 'לא ניתן לטעון את נתוני המלון כרגע.'), 'error');
      setReady();
      return;
    }
    const ai = payload.ai || null;
    renderHotel(payload.hotel, ai || aiState);
    setReady();
  } catch {
    if (sequence !== loadSequence) return;
    setMissingSections();
    renderSuggestions();
    setStatus('לא ניתן להתחבר לשירות נתוני המלונות כרגע.', 'error');
    setReady();
  }
}

async function loadHotels() {
  try {
    const response = await fetch('/api/hotels', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw new Error(errorMessage(payload, 'לא ניתן לטעון את רשימת המלונות.'));
    hotelSummaries = safeHotelList(payload);
    applyAiState(payload.ai);
    renderHotelOptions();
    const search = new URLSearchParams(window.location.search);
    const hasHotelParam = search.has('hotel');
    const queryId = search.get('hotel');
    defaultHotelId = hotelSummaries.find(item => item.available)?.id || hotelSummaries[0]?.id || '4458386';
    if (hasHotelParam && !HOTEL_IDS.has(queryId)) {
      showInvalidHotelState();
      return;
    }
    const initialId = hasHotelParam ? queryId : defaultHotelId;
    await selectHotel(initialId, false);
  } catch (error) {
    clearHotelData();
    setMissingSections();
    renderHotelOptions();
    setStatus(error instanceof Error ? error.message : 'לא ניתן לטעון את רשימת המלונות.', 'error');
    setReady();
  }
}

function renderChatMessage(kind, message, source) {
  const thread = $('[data-hc-thread]');
  if (!thread) return null;
  const isTyping = kind === 'typing';
  const row = el('div', `hc-row hc-row--${isTyping ? 'bot' : kind}`);
  const bubble = el('div', `hc-bubble${kind === 'error' ? ' hc-bubble--error' : ''}`);
  if (isTyping) {
    const dots = el('span', 'hc-typing__dots');
    dots.setAttribute('aria-hidden', 'true');
    dots.append(el('span'), el('span'), el('span'));
    bubble.append(el('span', 'hc-typing__label', message), dots);
  } else {
    text(bubble, message);
  }
  row.append(bubble);
  if (source) row.append(el('div', 'hc-src', source));
  thread.append(row);
  thread.scrollTop = thread.scrollHeight;
  return row;
}

function setChatBusy(busy) {
  chatPending = busy;
  $$('[data-hc-form]').forEach(form => {
    if (busy) form.setAttribute('aria-busy', 'true');
    else form.removeAttribute('aria-busy');
    $$('input, button', form).forEach(control => { control.disabled = busy; });
  });
  $$('.hotel-chat [data-hc-q]').forEach(button => {
    if (busy) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  });
}

function sourceLabel(source) {
  const labels = {
    'hotel-data': 'מקור: נתוני המלון',
    'guest-reviews': 'מקור: סיכומי ביקורות',
    'ygo-ai': 'תשובת AI · מקור: YGO'
  };
  return labels[source] || (source ? `מקור: ${source}` : '');
}

function boundedConversationHistory() {
  return conversationMessages.slice(-6).map(message => {
    const content = String(message.content || '').slice(0, 2000).replace(/[\uD800-\uDBFF]$/, '');
    return {
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content
    };
  });
}

async function askQuestion(question) {
  const value = String(question || '').trim();
  if (!value || !currentHotelId || chatPending) return;
  const requestId = ++chatSequence;
  const controller = new AbortController();
  activeAskController = controller;
  setChatBusy(true);
  renderChatMessage('user', value);
  const pending = renderChatMessage('typing', 'מחפש תשובה בנתוני המלון…');
  try {
    const response = await fetch(`/api/hotels/${encodeURIComponent(currentHotelId)}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ question: value, messages: boundedConversationHistory() }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (requestId !== chatSequence) return;
    pending?.remove();
    if (!response.ok) {
      const serverMessage = errorMessage(payload, '');
      const message = response.status === 503
        ? (serverMessage || aiState.reason || 'השאלה אינה זמינה כרגע.')
        : (serverMessage || 'לא ניתן לענות על השאלה כרגע.');
      renderChatMessage('error', message);
      return;
    }
    const answer = scalarText(payload && payload.answer) || 'לא נמצאה תשובה בנתוני המלון.';
    renderChatMessage('bot', answer, sourceLabel(payload && payload.source));
    conversationMessages.push({ role: 'user', content: value }, { role: 'assistant', content: answer });
    conversationMessages = conversationMessages.slice(-6);
  } catch {
    if (requestId === chatSequence) {
      pending?.remove();
      renderChatMessage('error', 'לא ניתן להתחבר לשירות השאלות כרגע.');
    }
  } finally {
    if (requestId === chatSequence) {
      activeAskController = null;
      setChatBusy(false);
    }
  }
}

function openChat(question) {
  if (question && chatPending) return;
  const modal = $('#hotel-chat-modal');
  if (!modal) return;
  lastChatFocus = document.activeElement;
  openManagedModal(modal, $('.hc-modal__close', modal), () => {
    if (lastChatFocus?.isConnected) lastChatFocus.focus();
  });
  if (question) askQuestion(question);
  else $('[data-hc-input]', modal)?.focus();
}

function wireChat() {
  const section = $('.hotel-chat');
  const modal = $('#hotel-chat-modal');
  section?.querySelectorAll('[data-hc-form]').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    const input = $('[data-hc-input]', form);
    const question = input?.value.trim();
    if (!question || chatPending) return;
    if (input) input.value = '';
    openChat(question);
  }));
  section?.querySelectorAll('[data-hc-q]').forEach(button => {
    button.addEventListener('click', () => { if (!chatPending) openChat(button.dataset.hcQ); });
  });
  modal?.querySelectorAll('[data-hc-form]').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    const input = $('[data-hc-input]', form);
    const question = input?.value.trim();
    if (!question || chatPending) return;
    if (input) input.value = '';
    askQuestion(question);
  }));
  modal?.querySelectorAll('[data-hc-close]').forEach(button =>
    button.addEventListener('click', () => showAndReturnFocus(modal, lastChatFocus)));
}

function closeMap() {
  const root = $('#hotel-map');
  showAndReturnFocus(root, lastMapFocus);
}

function openMap(trigger) {
  const root = $('#hotel-map');
  if (!root) return;
  lastMapFocus = trigger || document.activeElement;
  openManagedModal(root, $('.hotel-map__close', root), () => {
    if (lastMapFocus?.isConnected) lastMapFocus.focus();
  });
  void hotelMap.open();
}

function wireMap() {
  document.addEventListener('click', event => {
    const openButton = event.target.closest('[data-open-map]');
    if (openButton) {
      event.preventDefault();
      openMap(openButton);
      return;
    }
    if (event.target.closest('[data-map-close]')) closeMap();
  });
}

function wireGallery() {
  $('.hotel-gallery__grid')?.addEventListener('click', event => {
    const button = event.target.closest('.hotel-gallery__cell');
    if (button && !button.hidden) openGalleryCategories(Number(button.dataset.index) || 0);
  });
  $('.hotel-gallery__counter')?.addEventListener('click', () => openGalleryCategories(0));
  const root = $('#gallery-categories');
  root?.querySelector('[data-gc-tablist]')?.addEventListener('click', event => {
    const tab = event.target.closest('[data-gc-tab]');
    if (!tab) return;
    $$('.gallery-categories__tab', root).forEach(item => {
      item.classList.toggle('is-active', item === tab);
      item.setAttribute('aria-pressed', String(item === tab));
    });
    const category = tab.dataset.gcTab;
    $$('.gallery-categories__cell', root).forEach(cell => {
      cell.hidden = category !== 'all' && cell.dataset.cat !== category;
    });
  });
  root?.querySelector('[data-gc-grid]')?.addEventListener('click', event => {
    const cell = event.target.closest('[data-gallery-index]');
    if (!cell) return;
    const selected = galleryImages.filter(image =>
      $('[data-gc-tab].is-active', root)?.dataset.gcTab === 'all' ||
      categoryKey(image.category) === $('[data-gc-tab].is-active', root)?.dataset.gcTab);
    const chosen = galleryImages[Number(cell.dataset.galleryIndex)];
    const selectedIndex = selected.indexOf(chosen);
    openLightbox(selected, selectedIndex < 0 ? 0 : selectedIndex, cell);
  });
  root?.querySelector('[data-gc-tablist]')?.addEventListener('scroll', updateGalleryTabArrows, { passive: true });
  root?.querySelectorAll('[data-gc-scroll]')?.forEach(button => button.addEventListener('click', () => {
    const tablist = $('[data-gc-tablist]', root);
    if (!tablist) return;
    const direction = button.dataset.gcScroll === 'left' ? -1 : 1;
    tablist.scrollBy({ left: direction * Math.max(160, tablist.clientWidth * 0.7), behavior: 'smooth' });
  }));
  window.addEventListener('resize', updateGalleryTabArrows);
  root?.querySelectorAll('[data-gc-close]').forEach(button => button.addEventListener('click', () =>
    showAndReturnFocus(root, lastGalleryFocus)));
}

function wireFacilities() {
  const root = $('.facilities');
  const modal = $('#fac-modal');
  const viewport = $('.facilities__viewport');
  root?.querySelector('.facilities__arrow--prev')?.addEventListener('click', () => {
    viewport?.scrollBy({ left: Math.max(220, viewport.clientWidth * 0.8), behavior: 'smooth' });
  });
  root?.querySelector('.facilities__arrow--next')?.addEventListener('click', () => {
    viewport?.scrollBy({ left: -Math.max(220, viewport.clientWidth * 0.8), behavior: 'smooth' });
  });
  root?.addEventListener('click', event => {
    const button = event.target.closest('[data-fac-open]');
    if (!button) return;
    const group = facilityGroups.find(item => item.key === button.dataset.facOpen);
    if (!group) return;
    renderFacilityDialog(group);
    lastFacilityFocus = button;
    openManagedModal(modal, $('.fac-modal__close', modal), () => {
      if (lastFacilityFocus?.isConnected) lastFacilityFocus.focus();
    });
  });
  modal?.querySelectorAll('[data-fac-close]').forEach(button => button.addEventListener('click', () =>
    showAndReturnFocus(modal, lastFacilityFocus)));
}

function wireRooms() {
  const list = $('.room-list');
  // The vendored chip handler toggles aria-pressed before this bubbled event.
  $('.room-filters')?.addEventListener('click', event => {
    if (event.target.closest('.filter-chip')) applyRoomFilters();
  });
  list?.addEventListener('click', event => {
    if (event.target.closest('[data-clear-room-filters]')) {
      clearRoomFilters();
      $('.room-filters .filter-chip')?.focus();
      return;
    }
    const card = event.target.closest('.room-card');
    if (!card) return;
    if (event.target.closest('.bookit-mini')) {
      event.preventDefault();
      setStatus('קישור ומחירי Bookit הם להדגמה בלבד; לא מתבצעת התחברות או הזמנה.', 'info');
      return;
    }
    if (event.target.closest('.order-btn')) {
      event.preventDefault();
      setStatus('הצעת המחיר היא להדגמה בלבד; לא נשלחת הזמנה או בקשת תשלום.', 'info');
      return;
    }
    const gallery = event.target.closest('.room-gallery');
    if (gallery) {
      const photos = roomPhotoSets.get(gallery) || [];
      if (!photos.length) return;
      const arrow = event.target.closest('.gallery-arrow');
      let index = Number(gallery.dataset.photoIndex) || 0;
      if (arrow) {
        event.preventDefault();
        event.stopPropagation();
        const direction = arrow.classList.contains('gallery-arrow--next') ? 1 : -1;
        index = (index + direction + photos.length) % photos.length;
        gallery.dataset.photoIndex = String(index);
        const front = $('.room-gallery__img', gallery);
        const under = $('.room-gallery__under', gallery);
        [front, under].forEach(image => {
          if (!image) return;
          image.src = photos[index].url;
          image.alt = photos[index].alt || '';
        });
        return;
      }
      openLightbox(photos, index, gallery);
      return;
    }
    if (event.target.closest('.room-facilities__more, .room-facilities__readmore')) {
      event.preventDefault();
      updateRoomDialog(card.__hotelRoom, event.target.closest('button'));
    }
    if (event.target.closest('.room-option__details')) {
      setStatus('פירוט המיסים ותנאי המחיר בדף זה הם להדגמה בלבד.', 'info');
    }
  });
  const popup = $('#room-popup');
  popup?.querySelectorAll('[data-rp-close]').forEach(button => button.addEventListener('click', () =>
    showAndReturnFocus(popup, lastRoomFocus)));
  $('[data-rp-prev]', popup)?.addEventListener('click', () => {
    activePopupPhoto = (activePopupPhoto - 1 + Math.max(activeRoomPhotos.length, 1)) % Math.max(activeRoomPhotos.length, 1);
    updatePopupImage();
  });
  $('[data-rp-next]', popup)?.addEventListener('click', () => {
    activePopupPhoto = (activePopupPhoto + 1) % Math.max(activeRoomPhotos.length, 1);
    updatePopupImage();
  });
  popup?.addEventListener('click', event => {
    if (!event.target.closest('.room-popup__media, .room-popup__counter') ||
        event.target.closest('.room-popup__nav') || !activeRoomPhotos.length) return;
    openLightbox(activeRoomPhotos, activePopupPhoto,
      event.target.closest('.room-popup__counter') || $('.room-popup__counter', popup));
  });
}

function wireHotelPoliciesAndMore() {
  $('[data-toggle-places]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const list = $('.hotel-location__list');
    const expanded = button.getAttribute('aria-expanded') === 'true';
    list?.classList.toggle('hotel-location__list--clamped', expanded);
    button.setAttribute('aria-expanded', String(!expanded));
    text(button, expanded ? '+ עוד מקומות' : '− פחות מקומות');
  });
  const hamburger = $('.site-header__hamburger');
  const header = $('.site-header__inner');
  hamburger?.setAttribute('aria-expanded', 'false');
  hamburger?.addEventListener('click', () => {
    const expanded = hamburger.getAttribute('aria-expanded') !== 'true';
    hamburger.setAttribute('aria-expanded', String(expanded));
    header?.classList.toggle('is-menu-open', expanded);
  });
  hamburger?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      hamburger.setAttribute('aria-expanded', 'false');
      header?.classList.remove('is-menu-open');
      hamburger.focus();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && header?.classList.contains('is-menu-open')) {
      event.preventDefault();
      closeMobileHotelMenu(true);
    }
  });
  document.addEventListener('click', event => {
    if (!header?.classList.contains('is-menu-open') || event.target.closest('.site-header')) return;
    header.classList.remove('is-menu-open');
    hamburger?.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', event => {
    const unavailableNav = event.target.closest('.site-header__link[href^="/"]');
    if (unavailableNav) {
      event.preventDefault();
      setStatus('ניווט לאתרים ולמדורים אחרים אינו זמין בהדגמה זו.', 'info');
      return;
    }
    const searchSubmit = event.target.closest('.search-summary__submit, .stay-modify__submit');
    if (searchSubmit) {
      event.preventDefault();
      setStatus('התאריכים והרכב האורחים נשמרים להדגמה בלבד; לא מתבצעת בדיקת זמינות.', 'info');
      return;
    }
    if (event.target.closest('.hotel-title__cta')) {
      const packageType = event.target.closest('.hotel-title__cta').dataset.package;
      const target = packageType === 'flight' ? $('.flight-banner') : $('#sec-rooms');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setStatus('המחיר והאפשרויות מוצגים להדגמה בלבד.', 'info');
      return;
    }
    if (event.target.closest('.flight-banner__cta, .bookit-banner__btn')) {
      event.preventDefault();
      setStatus('אפשרויות הטיסה וההתחברות הן להדגמה בלבד; לא מתבצעת הזמנה.', 'info');
    }
  });
  document.addEventListener('click', event => {
    const suggestion = event.target.closest('[data-hotel-id]');
    if (suggestion && suggestion.closest('.hotel-suggestions')) {
      selectHotel(suggestion.dataset.hotelId, true);
    }
  });
  document.addEventListener('click', event => {
    const quickLink = event.target.closest('.hotel-title__link');
    if (!quickLink) return;
    if (quickLink.getAttribute('href') === '#map') {
      event.preventDefault();
      openMap(quickLink);
    } else if (quickLink.getAttribute('href') === '#share') {
      event.preventDefault();
      const url = window.location.href;
      if (navigator.share) {
        navigator.share({ title: document.title, url }).catch(() => {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => setStatus('קישור המלון הועתק.', 'success'))
          .catch(() => setStatus(url, 'info'));
      } else {
        setStatus(url, 'info');
      }
    }
  });
  document.addEventListener('hotel-title:select-room', () => $('#sec-rooms')?.scrollIntoView({ behavior: 'smooth' }));
  document.addEventListener('click', event => {
    const anchor = event.target.closest('.bookit-mini, .suggestion-card__cta:not([data-hotel-id])');
    if (anchor) {
      event.preventDefault();
      setStatus('קישורי הזמנה ומחירי Bookit בדף זה הם להדגמה בלבד.', 'info');
    }
  });
  document.addEventListener('click', event => {
    const bookingButton = event.target.closest('.order-btn');
    if (bookingButton) {
      event.preventDefault();
      setStatus('הצעת המחיר היא להדגמה בלבד; לא נשלחת הזמנה או בקשת תשלום.', 'info');
    }
  });
}

function wireNavigation() {
  document.addEventListener('hotel-title:tab-change', event => {
    const ids = {
      gallery: 'sec-gallery', about: 'sec-about', facilities: 'sec-facilities',
      location: 'sec-location', rooms: 'sec-rooms', reviews: 'sec-reviews'
    };
    const target = document.getElementById(ids[event.detail && event.detail.tab]);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  window.addEventListener('popstate', () => {
    const search = new URLSearchParams(window.location.search);
    const hasHotelParam = search.has('hotel');
    const queryId = search.get('hotel');
    if (hasHotelParam && !HOTEL_IDS.has(queryId)) {
      showInvalidHotelState();
      return;
    }
    const id = hasHotelParam ? queryId : defaultHotelId;
    if (id !== currentHotelId) selectHotel(id, false);
  });
}

function setupPageStructure() {
  createStatus();
  prepareLocationSelector();
  setupCommercialLabels();
  [
    ['.search-summary__cdates', 'עריכת תאריכי השהייה'],
    ['.search-summary__cpax', 'עריכת הרכב האורחים'],
    ['.search-summary__cedit', 'עריכת תאריכים ואורחים']
  ].forEach(([selector, label]) => {
    const node = $(selector);
    if (!node || node.tagName === 'BUTTON') return;
    const button = el('button', node.className);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    while (node.firstChild) button.append(node.firstChild);
    node.replaceWith(button);
  });
  const about = $('.about-hotel');
  about?.setAttribute('id', 'sec-about');
  $('.room-embed')?.setAttribute('id', 'sec-rooms');
  const chatInput = $('.hotel-chat__input');
  if (chatInput) chatInput.placeholder = 'לדוגמה: האם יש Wi-Fi או חניה?';
  text($('.hotel-chat__title'), 'שאלות על המלון');
  text($('.hc-modal__title'), 'שאלות על המלון');
  text($('.hotel-chat__badge'), 'שאלות על נתוני המלון');
  text($('.hotel-chat__note'), 'השאלות נשלחות לשרת; אין תשובות הדגמה.');
  $('.hotel-chat')?.setAttribute('aria-label', 'שאלות על המלון');
  const chatClose = $('.hc-modal__close');
  chatClose?.setAttribute('aria-label', 'סגירת השיחה');
  const chatHeader = $('.hc-modal__head');
  if (chatHeader && !$('.hotel-chat__privacy')) {
    chatHeader.after(el('p', 'hotel-chat__privacy', ''));
  }
  const mapRoot = $('#hotel-map');
  if (mapRoot) mapRoot.dataset.hotelMap = 'true';
  const mapCanvas = $('.hotel-map__canvas', mapRoot);
  if (mapCanvas) {
    mapCanvas.style.width = '100%';
    mapCanvas.style.height = '100%';
  }
  const oldFacData = $('#fac-data');
  if (oldFacData) oldFacData.textContent = '{}';
  const oldMapData = $('#hotel-map-data');
  if (oldMapData) oldMapData.textContent = '{}';
}

function handleNoBooking() {
  document.addEventListener('click', event => {
    const link = event.target.closest('.bookit-mini, .suggestion-card__cta:not([data-hotel-id])');
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      setStatus('מחירים וקישורי הזמנה הם להדגמה בלבד. אין תהליך הזמנה באתר.', 'info');
    }
  }, true);
  document.addEventListener('click', event => {
    const button = event.target.closest('.order-btn');
    if (button) {
      event.preventDefault();
      setStatus('המחירים ותנאי האירוח הם להדגמה בלבד; אין אפשרות להזמין או לשלם.', 'info');
    }
  }, true);
}

setupPageStructure();
new ResizeObserver(updateExperiencePreviews).observe($('.hotel-experiences__grid'));
wireChat();
wireMap();
wireGallery();
wireFacilities();
wireRooms();
wireHotelPoliciesAndMore();
wireNavigation();
handleNoBooking();
loadHotels();
