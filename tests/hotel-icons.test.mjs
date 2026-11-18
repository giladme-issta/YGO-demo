import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../public/hotel-page/hotel-app.js', import.meta.url), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));
const iconSetup = section('const FACILITY_ICON_LABELS', 'const CATEGORY_LABELS');
const renderers = [
  section('function makeSupplementalIcon(', 'function renderFacilities('),
  section('function renderPolicies(', 'function renderExperiences('),
  section('function renderReviewList(', 'function renderReviews('),
].join('\n');

function node(tagName, attributes = {}, textContent = '') {
  return {
    tagName, attributes: { ...attributes }, textContent, children: [],
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    cloneNode() {
      const copy = node(this.tagName, this.attributes, this.textContent);
      copy.children = this.children.map(child => child.cloneNode());
      return copy;
    },
  };
}

function fixture() {
  const original = name => node('svg', { 'data-source': name });
  const policies = node('ul');
  policies.children = ['קבלת חדרים', 'החזרת חדרים', 'מדיניות ביטולים', 'מדיניות בע״ח', 'חנייה']
    .map(label => ({ label: node('span', {}, label), icon: original(label) }));
  const good = node('ul');
  const bad = node('ul');
  good.append(original('mock-good'));
  bad.append(original('mock-bad'));
  const facilityTemplates = [
    { closest: () => ({ textContent: 'אוכל ושתייה' }), svg: original('mock-food') },
    { closest: () => ({ textContent: 'שירות וקבלה' }), svg: original('mock-services') },
  ];
  const bed = original('mock-bed');
  const context = vm.createContext({
    Map, Object,
    document: {
      createElementNS: (namespace, tag) => node(tag),
      createTextNode: value => node('#text', {}, value),
    },
    $: (selector, root) => {
      if (selector === '.hotel-map__hotel-badge svg') return bed;
      if (selector === '.hotel-know__list') return policies;
      if (selector === '.hotel-know__label') return root.label;
      if (selector === '.hotel-know__icon') return root.icon;
      if (selector === '.reviews__pt--good svg.reviews__ic') return good.children[0];
      if (selector === '.reviews__pt--bad svg.reviews__ic') return bad.children[0];
      if (selector === 'svg.reviews__ic') return root.children[0];
      if (selector === 'svg') return root.svg;
    },
    $$: (selector, root) => selector === '.facilities__track [data-fac-icon]'
      ? facilityTemplates : selector === '.hotel-know__item' ? (root || policies).children : [],
    el: (tag, className, value = '') => node(tag, { class: className }, value),
    clear: target => target.replaceChildren(),
    categoryKey: () => 'other',
    scalarText: value => typeof value === 'string' ? value.trim() : '',
    textItems: value => Array.isArray(value) ? value : value ? [value] : [],
    normalizedFacilities: hotel => hotel.facilities || [],
    showEmpty: () => { throw new Error('Unexpected empty state'); },
  });
  vm.runInContext(iconSetup + renderers, context);
  // Match clearHotelData: templates disappear before the first hotel is rendered.
  policies.replaceChildren();
  good.replaceChildren();
  bad.replaceChildren();
  return { context, policies, good, bad };
}

test('original policy and review icons survive initial clearing and subsequent hotel changes', () => {
  const { context, policies, good, bad } = fixture();
  for (const checkIn of ['15:00', '16:00']) {
    context.renderPolicies({ policies: { checkIn, checkOut: '11:00' } });
    assert.deepEqual(policies.children.map(row => row.children[0].getAttribute('data-source')),
      ['קבלת חדרים', 'החזרת חדרים']);
    context.renderReviewList(good, ['Good feedback'], true);
    context.renderReviewList(bad, ['Critical feedback'], false);
    assert.equal(good.children[0].children[0].getAttribute('data-source'), 'mock-good');
    assert.equal(bad.children[0].children[0].getAttribute('data-source'), 'mock-bad');
    policies.replaceChildren();
    good.replaceChildren();
    bad.replaceChildren();
  }
});

test('guest conditions, hotel policies and house rules get distinct nonempty SVGs', () => {
  const { context, policies } = fixture();
  context.renderPolicies({
    policies: { guestPolicies: ['Guests'], policies: ['Policy'], houseRules: ['Rules'] },
  });
  const icons = policies.children.map(row => row.children[0]);
  assert.ok(icons.every(icon => icon.tagName === 'svg' && icon.getAttribute('aria-hidden') === 'true'));
  const paths = icons.map(icon => icon.children[0].getAttribute('d'));
  assert.ok(paths.every(path => path.length > 0));
  assert.equal(new Set(paths).size, 3);
});

test('facility groups prefer mock icons and supply balcony or info SVGs where none exist', () => {
  const { context } = fixture();
  for (const [group, source] of [
    ['אוכל ושתייה', 'mock-food'],
    ['מתקנים ושירותים', 'mock-services'],
    ['room_bedding', 'mock-bed'],
  ]) {
    const icon = context.makeFacilityIcon(group).children[0];
    assert.equal(icon.tagName, 'svg');
    assert.equal(icon.getAttribute('data-source'), source);
  }
  const outdoor = context.makeFacilityIcon('room_outdoor').children[0];
  const unknown = context.makeFacilityIcon('New supplier category').children[0];
  assert.equal(outdoor.tagName, 'svg');
  assert.equal(unknown.tagName, 'svg');
  assert.ok(outdoor.children[0].getAttribute('d'));
  assert.ok(unknown.children[0].getAttribute('d'));
  assert.notEqual(outdoor.children[0].getAttribute('d'), unknown.children[0].getAttribute('d'));
});
