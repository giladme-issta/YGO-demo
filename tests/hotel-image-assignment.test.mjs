import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../public/hotel-page/hotel-app.js', import.meta.url), 'utf8');
const imageHelpers = app.slice(
  app.indexOf('function categoryKey('),
  app.indexOf('const FACILITY_ICON_LABELS'),
);
const context = vm.createContext({});
vm.runInContext(imageHelpers, context);

const imageNormalizationHelpers = app.slice(
  app.indexOf('function safeHttpUrl('),
  app.indexOf('function safeHotelList('),
);
const facilityNormalizationHelpers = [
  app.slice(app.indexOf('function localizedFacilityGroup('), app.indexOf('function renderGallery(')),
  app.slice(app.indexOf('function facilityName('), app.indexOf('function makeCheckIcon(')),
].join('\n');
const groupImageHelper = app.slice(
  app.indexOf('function groupImage('),
  app.indexOf('function makeSupplementalIcon('),
);
const facilityPlaceholderHelper = app.slice(
  app.indexOf('function makeFacilityPlaceholder('),
  app.indexOf('function renderFacilities('),
);
const renderFacilities = app.slice(
  app.indexOf('function renderFacilities('),
  app.indexOf('function renderFacilityDialog('),
);
const renderFacilityDialog = app.slice(
  app.indexOf('function renderFacilityDialog('),
  app.indexOf('function renderLocation('),
);
const openLightbox = app.slice(
  app.indexOf('function openLightbox('),
  app.indexOf('function renderAbout('),
);

function fixtureElement(tagName = 'div', className = '') {
  let classes = new Set(className.split(/\s+/).filter(Boolean));
  const element = {
    tagName: tagName.toUpperCase(),
    children: [],
    attributes: new Map(),
    listeners: new Map(),
    dataset: {},
    hidden: false,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
    },
    append: (...nodes) => element.children.push(...nodes),
    replaceChildren: (...nodes) => { element.children = [...nodes]; },
    setAttribute: (name, value) => element.attributes.set(name, String(value)),
    addEventListener: (name, listener) => element.listeners.set(name, listener),
    focus() {},
    click() { element.listeners.get('click')?.({ target: element }); },
  };
  Object.defineProperty(element, 'className', {
    get: () => [...classes].join(' '),
    set: value => { classes = new Set(String(value).split(/\s+/).filter(Boolean)); },
  });
  element.className = className;
  return element;
}

function facilityFixture() {
  const modal = fixtureElement('div');
  const modalIcon = fixtureElement('span');
  const photoContainer = fixtureElement('div', 'fac-photos');
  const modalElements = new Map([
    ['[data-fac-title]', fixtureElement('h2')],
    ['[data-fac-sub]', fixtureElement('p')],
    ['[data-fac-ic]', modalIcon],
    ['[data-fac-intro]', fixtureElement('p')],
    ['[data-fac-photos]', photoContainer],
    ['[data-fac-list]', fixtureElement('ul')],
  ]);
  const track = fixtureElement('ul');
  const viewport = fixtureElement('div');
  const selectors = new Map([
    ['#fac-modal', modal],
    ['.facilities__track', track],
    ['.facilities__viewport', viewport],
  ]);
  const events = [];
  const document = {
    createElement: tagName => fixtureElement(tagName),
    createTextNode: value => ({ textContent: String(value) }),
    dispatchEvent: event => events.push(event),
  };
  const context = vm.createContext({
    URL,
    document,
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    $: selector => modalElements.get(selector) || selectors.get(selector) || null,
    clear: node => node?.replaceChildren(),
    text: (node, value) => { if (node) node.textContent = value == null ? '' : String(value); },
    el: (tagName, className, value) => {
      const node = fixtureElement(tagName, className || '');
      if (value != null) node.textContent = String(value);
      return node;
    },
    makeFacilityIcon: () => fixtureElement('span'),
    makeFacilityIconSvg: group => {
      const icon = fixtureElement('svg');
      icon.setAttribute('data-icon-group', group);
      return icon;
    },
    makeFacilityRow: () => fixtureElement('li'),
    facilityIconKey: () => 'info',
    makeSupplementalIcon: () => fixtureElement('svg'),
    showEmpty() {},
    facilityGroups: [],
  });
  vm.runInContext([
    imageNormalizationHelpers,
    imageHelpers,
    facilityNormalizationHelpers,
    groupImageHelper,
    facilityPlaceholderHelper,
    renderFacilities,
    renderFacilityDialog,
    openLightbox,
  ].join('\n'), context);
  return { context, modalIcon, photoContainer, events };
}

test('category image matching maps beach to location and never reuses an image URL', () => {
  const aquaParkImage = {
    url: 'https://hotelimages.sunhotels.net/HotelInfo/hotelImage.aspx?id=98208426',
    category: 'aqua_park',
  };
  const beachImage = { url: 'beach-image', category: 'beach' };
  const secondPoolImage = { url: 'pool-image-2', category: 'pool' };
  const images = [aquaParkImage, beachImage, secondPoolImage];
  const usedUrls = new Set();

  const poolImage = context.findCategoryImage('pool', images, usedUrls);
  assert.equal(poolImage.url, aquaParkImage.url);
  usedUrls.add(poolImage.url);

  const locationImage = context.findCategoryImage('location', images, usedUrls);
  assert.equal(locationImage.url, beachImage.url);
  usedUrls.add(locationImage.url);
  assert.equal(context.findCategoryImage('facilities_and_services', images, usedUrls), null);

  const nextPoolImage = context.findCategoryImage('swimming_pool', images, usedUrls);
  assert.equal(nextPoolImage.url, secondPoolImage.url);
  usedUrls.add(nextPoolImage.url);

  assert.equal(context.findCategoryImage('location', images, usedUrls), null);
  assert.equal(context.findCategoryImage('pool', images, usedUrls), null);
});

test('facility cards reserve category matches before using unique fallback images', () => {
  const f = facilityFixture();
  const selectedHotel = {
    facilities: [
      { name: 'Reception', group: 'facilities_and_services' },
      { name: 'Private beach', group: 'location' },
      { name: 'Restaurant', group: 'food_and_drink' },
    ],
    images: [
      { url: 'https://images.example.test/pool.jpg', category: 'pool' },
      { url: 'https://images.example.test/beach.jpg', category: 'beach' },
      { url: 'https://images.example.test/restaurant.jpg', category: 'restaurant' },
      { url: 'https://images.example.test/exterior.jpg', category: 'exterior' },
    ],
  };

  f.context.renderFacilities(selectedHotel);
  const cards = Array.from(f.context.$('.facilities__track').children)
    .map(slide => slide.children[0]);
  const imageUrls = cards.map(card => card.children[0].children[0].src);

  assert.deepEqual(imageUrls, [
    'https://images.example.test/exterior.jpg',
    'https://images.example.test/beach.jpg',
    'https://images.example.test/restaurant.jpg',
  ]);
  assert.equal(new Set(imageUrls).size, cards.length);
});

test('facility cards use a placeholder instead of duplicating a photo when images run out', () => {
  const f = facilityFixture();
  const selectedHotel = {
    facilities: [
      { name: 'Private beach', group: 'location' },
      { name: 'Restaurant', group: 'food_and_drink' },
    ],
    images: [{ url: 'https://images.example.test/beach.jpg', category: 'beach' }],
  };

  f.context.renderFacilities(selectedHotel);
  const cards = Array.from(f.context.$('.facilities__track').children)
    .map(slide => slide.children[0]);

  assert.equal(cards[0].children[0].children[0].src, 'https://images.example.test/beach.jpg');
  assert.equal(cards[1].children[0].classList.contains('fac-card__media--placeholder'), true);
  assert.equal(cards[1].children[0].children.length, 1);
});

test('facility dialog renders selected-hotel category photos and opens the full matching gallery', () => {
  const f = facilityFixture();
  const selectedHotel = {
    facilities: [{ name: 'בריכת שחייה', group: 'בריכות וחוף' }],
    images: [
      { url: 'https://images.example.test/room.jpg', category: 'guest_room' },
      ...Array.from({ length: 7 }, (_, index) => ({
        url: `https://images.example.test/pool-${index + 1}.jpg`,
        alt: `בריכה ${index + 1}`,
        category: index === 0 ? 'aqua_park' : 'pool',
      })),
    ],
  };
  const expectedUrls = selectedHotel.images.slice(1).map(image => image.url);

  f.context.renderFacilities(selectedHotel);
  const [group] = Array.from(f.context.facilityGroups);
  assert.deepEqual(Array.from(group.photos, photo => photo.url), expectedUrls);

  f.context.renderFacilityDialog(group);
  assert.equal(f.modalIcon.children[0].attributes.get('data-icon-group'), group.name);
  const tiles = f.photoContainer.children;
  assert.equal(f.photoContainer.classList.contains('fac-photos--n5'), true);
  assert.deepEqual(tiles.slice(0, 5).map(tile => tile.children[0].src), expectedUrls.slice(0, 5));
  assert.equal(tiles[4].children[1].textContent, '+2');

  tiles[4].click();
  const lightboxEvent = f.events.find(event => event.type === 'gallery-lightbox:open');
  assert.ok(lightboxEvent);
  assert.equal(lightboxEvent.detail.index, 4);
  assert.deepEqual(Array.from(lightboxEvent.detail.photos, photo => photo.src), expectedUrls);
});

test('category image collection returns every image for a normalized category only', () => {
  const images = [
    { url: 'waterpark-image', category: 'aqua_park' },
    { url: 'pool-image', category: 'pool' },
    { url: 'restaurant-image', category: 'restaurant' },
  ];

  const poolImages = context.findCategoryImages('swimming_pool', images);
  assert.deepEqual(poolImages.map(image => image.url), ['waterpark-image', 'pool-image']);
  assert.deepEqual(Array.from(context.findCategoryImages('unknown', images)), []);
});
