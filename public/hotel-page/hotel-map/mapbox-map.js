const SDK = 'https://api.mapbox.com/mapbox-gl-js/v3.16.0';
const SEARCH_RADIUS = 50000;
const CATEGORIES = [
  { id: 'tourist_attraction', label: 'אטרקציה' },
  { id: 'beach', label: 'חוף' },
  { id: 'restaurant', label: 'מסעדה' },
  { id: 'airport', label: 'שדה תעופה' },
];
const GROUPS = [
  { key: 'walk', label: 'ברגל' },
  { key: 'drive', label: 'נסיעה קצרה' },
  { key: 'day', label: 'טיולי יום' },
  { key: 'arrive', label: 'הגעה' },
];
let sdkPromise;

export function mapFailureMessage(error) {
  switch (error.message) {
    case 'MAPBOX_HTTP_503':
      return 'לא הוגדר מפתח Mapbox ציבורי בשרת. יש לבדוק את MAPBOX_PUBLIC_TOKEN ולהפעיל מחדש את השרת.';
    case 'MAPBOX_HTTP_404':
      return 'שרת ההדגמה אינו מעודכן. יש לעצור אותו ולהפעיל מחדש באמצעות npm start.';
    case 'MAPBOX_SDK_FAILED':
    case 'MAPBOX_SDK_TIMEOUT':
      return 'ספריית המפה לא נטענה מה־CDN של Mapbox. יש לבדוק את החיבור לרשת ולנסות שוב.';
    case 'MAPBOX_WEBGL_UNAVAILABLE':
      return 'הדפדפן אינו תומך ב־WebGL הנדרש להצגת המפה.';
    case 'MAPBOX_CONFIG_INVALID':
      return 'השרת החזיר הגדרת Mapbox לא תקינה. נדרש מפתח ציבורי שמתחיל ב־pk.';
    default:
      return 'טעינת המפה נכשלה. יש לבדוק את החיבור לשרת ול־Mapbox ולנסות שוב.';
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function coordinates(location) {
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [longitude, latitude];
}

export function distanceMeters(from, to) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(to[1] - from[1]);
  const dLon = radians(to[0] - from[0]);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from[1])) * Math.cos(radians(to[1])) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function mapPlaces(features, center, category) {
  return features.flatMap(feature => {
    const properties = feature?.properties;
    const point = coordinates(properties?.coordinates);
    const name = properties?.name;
    if (!point || typeof name !== 'string' || !name.trim()) return [];
    const distance = distanceMeters(center, point);
    if (distance > SEARCH_RADIUS) return [];
    return [{
      id: properties.mapbox_id || `${name}:${point.join(',')}`,
      name: name.trim(), point, distance, type: category.label,
      group: category.id === 'airport' ? 'arrive' : distance <= 1000 ? 'walk' : distance <= 10000 ? 'drive' : 'day',
    }];
  });
}

function loadSdk() {
  if (sdkPromise) return sdkPromise;
  const script = document.createElement('script');
  const style = document.createElement('link');
  script.src = `${SDK}/mapbox-gl.js`;
  style.rel = 'stylesheet';
  style.href = `${SDK}/mapbox-gl.css`;
  sdkPromise = Promise.all([script, style].map(node => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MAPBOX_SDK_TIMEOUT')), 20000);
    node.onload = () => { clearTimeout(timer); resolve(); };
    node.onerror = () => { clearTimeout(timer); reject(new Error('MAPBOX_SDK_FAILED')); };
    document.head.append(node);
  }))).then(() => {
    if (!globalThis.mapboxgl) throw new Error('MAPBOX_SDK_FAILED');
    return globalThis.mapboxgl;
  }).catch(error => {
    script.remove();
    style.remove();
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

async function json(url, signal) {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  });
  if (!response.ok) throw new Error(`MAPBOX_HTTP_${response.status}`);
  return response.json();
}

export function createHotelMap(root) {
  const canvas = root.querySelector('[data-map-canvas]');
  const filters = root.querySelector('[data-map-filters]');
  const list = root.querySelector('[data-map-list]');
  const live = root.querySelector('[data-map-live]');
  const status = root.querySelector('[data-map-status]');
  const source = root.querySelector('[data-map-source]');
  const hotelTemplate = root.querySelector('.hotel-map__marker--hotel').cloneNode(true);
  let hotel;
  let map;
  let controller;
  let opening = false;
  let rows = [];
  let selected = new Set();
  let active = -1;
  let scrollTimer;
  let loadTimer;
  let suppressScrollUntil = 0;
  const mobile = () => matchMedia('(max-width: 768px)').matches;

  function message(value) {
    status.textContent = value;
    status.hidden = !value;
  }

  function clearActive() {
    active = -1;
    rows.forEach(({ card, marker }) => {
      card.classList.remove('is-active');
      card.setAttribute('aria-pressed', 'false');
      marker.getElement().classList.remove('is-active');
    });
  }

  function activate(index, reveal = false) {
    const row = rows[index];
    if (!row || row.card.hidden || !map) return;
    clearActive();
    active = index;
    row.card.classList.add('is-active');
    row.card.setAttribute('aria-pressed', 'true');
    row.marker.getElement().classList.add('is-active');
    const height = canvas.clientHeight;
    map.easeTo({
      center: row.place.point, duration: 450,
      offset: mobile() ? [0, -Math.min(65, height / 4)] : [0, 0],
    });
    if (reveal) {
      suppressScrollUntil = Date.now() + 600;
      row.card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }

  function applyFilter() {
    clearActive();
    let shown = 0;
    rows.forEach(({ card, marker, place }) => {
      const visible = !selected.size || selected.has(place.group);
      card.hidden = !visible;
      marker.getElement().hidden = !visible;
      if (visible) shown++;
    });
    filters.querySelectorAll('button').forEach(tag => {
      tag.setAttribute('aria-pressed', String(tag.dataset.group ? selected.has(tag.dataset.group) : !selected.size));
    });
    list.querySelectorAll('.hotel-map__group').forEach(head => {
      head.hidden = selected.size > 0 && !selected.has(head.dataset.group);
    });
    live.textContent = `מוצגים ${shown} מקומות`;
    list.scrollTop = 0;
    list.scrollLeft = 0;
    if (mobile()) activate(rows.findIndex(row => !row.card.hidden));
  }

  function renderPlaces(places, gl) {
    list.replaceChildren();
    filters.replaceChildren();
    rows.forEach(row => row.marker.remove());
    rows = [];
    selected.clear();
    if (!places.length) {
      list.append(element('p', 'hotel-empty-state', 'לא נמצאו מקומות סמוכים ב־Mapbox.'));
      return;
    }
    const groups = GROUPS.filter(group => places.some(place => place.group === group.key));
    for (const group of [{ key: '', label: 'הכל' }, ...groups]) {
      const count = places.filter(place => !group.key || place.group === group.key).length;
      const tag = element('button', 'hotel-map__tag', `${group.label} (${count})`);
      tag.type = 'button';
      tag.dataset.group = group.key;
      tag.addEventListener('click', () => {
        if (!group.key) selected.clear();
        else if (selected.has(group.key)) selected.delete(group.key);
        else selected.add(group.key);
        if (selected.size === groups.length) selected.clear();
        applyFilter();
      });
      filters.append(tag);
    }
    for (const group of groups) {
      const heading = element('p', 'hotel-map__group');
      heading.dataset.group = group.key;
      heading.append(element('span', 'hotel-map__group-name', group.label));
      list.append(heading);
      for (const place of places.filter(item => item.group === group.key)) {
        const index = rows.length;
        const card = element('button', 'hotel-map__card');
        card.type = 'button';
        card.dataset.index = String(index);
        const top = element('span', 'hotel-map__card-top');
        const distance = place.distance >= 1000
          ? `${(place.distance / 1000).toLocaleString('he-IL', { maximumFractionDigits: 1 })} ק״מ`
          : `${Math.round(place.distance)} מטר`;
        top.append(element('bdi', 'hotel-map__card-name', place.name),
          element('span', 'hotel-map__card-dist', distance));
        card.append(top, element('span', 'hotel-map__card-meta', `${place.type} · בקו אווירי`));
        const pin = element('button', 'hotel-map__marker hotel-map__marker--place');
        pin.type = 'button';
        pin.dataset.index = String(index);
        pin.setAttribute('aria-label', place.name);
        pin.append(element('span', 'hotel-map__dot'), element('bdi', 'hotel-map__mtip', place.name));
        const marker = new gl.Marker({ element: pin }).setLngLat(place.point).addTo(map);
        pin.setAttribute('role', 'button');
        pin.addEventListener('click', () => activate(index, true));
        card.addEventListener('click', () => activate(index));
        card.addEventListener('mouseenter', () => { if (!mobile()) activate(index); });
        card.addEventListener('focus', () => { if (!mobile()) activate(index); });
        rows.push({ card, marker, place });
        list.append(card);
      }
    }
    const center = coordinates(hotel.location);
    const bounds = new gl.LngLatBounds(center, center);
    places.forEach(place => bounds.extend(place.point));
    map.fitBounds(bounds, {
      padding: { top: 60, right: 60, bottom: mobile() ? 150 : 60, left: 60 },
      maxZoom: 14, duration: 0,
    });
    applyFilter();
  }

  async function loadPlaces(gl, center, token, signal) {
    const results = await Promise.allSettled(CATEGORIES.map(async category => {
      const url = new URL(`https://api.mapbox.com/search/searchbox/v1/category/${category.id}`);
      url.search = new URLSearchParams({
        access_token: token, proximity: center.join(','), country: 'CY', language: 'en', limit: '10',
      });
      const result = await json(url, signal);
      if (!Array.isArray(result.features)) throw new Error('MAPBOX_PLACES_INVALID');
      return mapPlaces(result.features, center, category);
    }));
    if (signal.aborted) return;
    const places = new Map();
    results.forEach(result => {
      if (result.status === 'fulfilled') result.value.forEach(place => {
        if (!places.has(place.id)) places.set(place.id, place);
      });
    });
    renderPlaces([...places.values()].sort((a, b) => a.distance - b.distance), gl);
    if (results.some(result => result.status === 'rejected')) {
      const forbidden = results.some(result => result.status === 'rejected' && result.reason.message === 'MAPBOX_HTTP_403');
      source.textContent = forbidden
        ? 'Mapbox חסם את חיפוש המקומות (403). יש לבדוק את הרשאות Search Box בחשבון ובמפתח.'
        : 'חלק מהמקומות לא נטענו מ־Mapbox. יש לבדוק את הרשאות Search Box והחיבור לרשת.';
      if (!places.size) list.replaceChildren(element('p', 'hotel-empty-state', 'טעינת המקומות מ־Mapbox נכשלה.'));
    } else {
      source.textContent = 'מקומות: Mapbox · המרחקים בקו אווירי, ללא זמני נסיעה.';
    }
  }

  async function open() {
    if (map) { map.resize(); return; }
    if (opening || !hotel) return;
    const center = coordinates(hotel.location);
    if (!center) {
      message('קואורדינטות המלון אינן זמינות ולכן לא ניתן להציג מפה.');
      return;
    }
    opening = true;
    controller = new AbortController();
    const { signal } = controller;
    message('טוען מפה…');
    source.textContent = 'טוען מקומות סמוכים מ־Mapbox…';
    try {
      const config = await json('/api/map-config', signal);
      if (signal.aborted) return;
      if (typeof config?.accessToken !== 'string' || !config.accessToken.startsWith('pk.')) {
        throw new Error('MAPBOX_CONFIG_INVALID');
      }
      const gl = await loadSdk();
      if (signal.aborted) return;
      if (!gl.supported()) throw new Error('MAPBOX_WEBGL_UNAVAILABLE');
      map = new gl.Map({
        container: canvas, accessToken: config.accessToken,
        style: 'mapbox://styles/mapbox/streets-v12',
        center, zoom: 14, attributionControl: true,
      });
      const pin = hotelTemplate.cloneNode(true);
      pin.removeAttribute('data-x');
      pin.removeAttribute('data-y');
      pin.setAttribute('aria-label', hotel.name);
      pin.querySelector('.hotel-map__mtip').textContent = hotel.name;
      new gl.Marker({ element: pin }).setLngLat(center).addTo(map);
      pin.setAttribute('role', 'button');
      pin.addEventListener('click', () => pin.classList.toggle('is-active'));
      root.querySelectorAll('[data-zoom-in], [data-zoom-out]').forEach(button => { button.disabled = false; });
      loadTimer = setTimeout(() => {
        message('טעינת המפה מתעכבת. יש לבדוק את החיבור לרשת ואת הרשאות מפתח Mapbox.');
      }, 20000);
      map.on('load', () => {
        clearTimeout(loadTimer);
        message('');
        map.resize();
      });
      map.on('error', event => {
        clearTimeout(loadTimer);
        message(event.error?.status === 403
          ? 'Mapbox חסם את טעינת המפה (403). יש לבדוק את הרשאות החשבון והמפתח.'
          : 'לא ניתן לטעון את המפה במלואה. יש לבדוק את החיבור והרשאות מפתח Mapbox.');
      });
      await loadPlaces(gl, center, config.accessToken, signal);
    } catch (error) {
      if (signal.aborted) return;
      message(mapFailureMessage(error));
      source.textContent = 'המקומות הסמוכים אינם זמינים כרגע.';
      clearTimeout(loadTimer);
      map?.remove();
      map = null;
      root.querySelectorAll('[data-zoom-in], [data-zoom-out]').forEach(button => { button.disabled = true; });
    } finally {
      if (!signal.aborted) opening = false;
    }
  }

  function setHotel(value) {
    controller?.abort();
    clearTimeout(scrollTimer);
    clearTimeout(loadTimer);
    map?.remove();
    map = null;
    hotel = value;
    opening = false;
    rows = [];
    active = -1;
    selected.clear();
    canvas.replaceChildren();
    list.replaceChildren();
    filters.replaceChildren();
    message('');
    source.textContent = '';
    live.textContent = '';
    root.querySelectorAll('[data-zoom-in], [data-zoom-out]').forEach(button => { button.disabled = true; });
  }

  root.querySelector('[data-zoom-in]').addEventListener('click', () => map?.zoomIn());
  root.querySelector('[data-zoom-out]').addEventListener('click', () => map?.zoomOut());
  list.addEventListener('mouseleave', () => { if (!mobile()) clearActive(); });
  list.addEventListener('scroll', () => {
    if (!mobile() || Date.now() < suppressScrollUntil) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const bounds = list.getBoundingClientRect();
      const midpoint = (bounds.left + bounds.right) / 2;
      let nearest = -1;
      let distance = Infinity;
      rows.forEach(({ card }, index) => {
        if (card.hidden) return;
        const rect = card.getBoundingClientRect();
        const delta = Math.abs((rect.left + rect.right) / 2 - midpoint);
        if (delta < distance) { nearest = index; distance = delta; }
      });
      if (nearest !== active) activate(nearest);
    }, 100);
  }, { passive: true });
  return { setHotel, open };
}
