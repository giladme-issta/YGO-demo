import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../public/hotel-page/hotel-app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/hotel-page/index.html', import.meta.url), 'utf8');
const filters = app.slice(app.indexOf('function applyRoomFilters()'), app.indexOf('function updateRoomDialog('));

function node(className = '', dataset = {}) {
  const classes = new Set(className.split(' '));
  return {
    dataset, children: [], hidden: false, attributes: {},
    classList: { contains: value => classes.has(value), remove: value => classes.delete(value) },
    setAttribute(key, value) { this.attributes[key] = value; },
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); },
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
  };
}

function fixture() {
  const chips = [
    node('filter-chip filter-chip--active', { demoRefundable: 'true' }),
    ...['breakfast', 'room-only', 'half-board'].map(demoBasis => node('filter-chip', { demoBasis })),
  ];
  chips.forEach((chip, index) => chip.setAttribute('aria-pressed', String(index === 0)));
  const list = node('room-list');
  const card = node('room-card');
  const description = Object.freeze({ name: 'YGO room', description: 'Unchanged content', facilities: ['Wi-Fi'] });
  card.__hotelRoom = description;
  const options = [...html.matchAll(/<div class="room-option" data-demo-basis="([^"]+)" data-demo-refundable="([^"]+)">/g)]
    .map(([, demoBasis, demoRefundable]) => node('room-option', { demoBasis, demoRefundable }));
  assert.equal(options.length, 3, 'use the three existing template offers');
  const dividers = options.map(() => node('room-option__divider'));
  options.forEach((option, index) => {
    option.previousElementSibling = dividers[index - 1];
    option.nextElementSibling = dividers[index];
    card.append(option, dividers[index]);
  });
  list.append(card);
  const $$ = (selector, root) => {
    if (selector.startsWith('.room-filters')) {
      return selector.includes('[aria-pressed=') ? chips.filter(chip => chip.attributes['aria-pressed'] === 'true') : chips;
    }
    return root.children.filter(child => child.classList.contains(selector.slice(1)));
  };
  const context = vm.createContext({
    $: (selector, root) => selector === '.room-list' ? list : $$(selector, root)[0],
    $$,
    el: (tag, className, text) => Object.assign(node(className || ''), { tag, text }),
  });
  vm.runInContext(filters, context);
  return {
    chips, list, card, options, dividers, description,
    select: (...indices) => chips.forEach((chip, index) => chip.setAttribute('aria-pressed', String(indices.includes(index)))),
    apply: () => context.applyRoomFilters(),
    clear: () => context.clearRoomFilters(),
  };
}

test('existing demo basis offers use OR within meal plans and AND with free cancellation', () => {
  const f = fixture();
  f.apply();
  assert.deepEqual(f.options.map(option => option.hidden), [true, false, false]);
  assert.equal(f.dividers.filter(divider => !divider.hidden).length, 1);
  f.select(0, 2);
  f.apply();
  assert.deepEqual(f.options.map(option => option.hidden), [true, false, true]);
  assert.equal(f.dividers.filter(divider => !divider.hidden).length, 0);
  f.select(0, 2, 3);
  f.apply();
  assert.deepEqual(f.options.map(option => option.hidden), [true, false, false]);
  f.select(2);
  f.apply();
  assert.deepEqual(f.options.map(option => option.hidden), [false, false, true]);
  f.select(3);
  f.apply();
  assert.deepEqual(f.options.map(option => option.hidden), [true, true, false]);
  f.select();
  f.apply();
  assert.ok(f.options.every(option => !option.hidden));
  assert.equal(f.card.__hotelRoom, f.description);
});

test('missing breakfast offers show one empty state; clearing restores offers and chips', () => {
  const f = fixture();
  f.select(0, 1);
  f.apply();
  f.apply();
  assert.equal(f.card.hidden, true);
  const empty = f.list.children.filter(child => child.classList.contains('hotel-room-filter-empty'));
  assert.equal(empty.length, 1);
  assert.equal(empty[0].attributes.role, 'status');
  assert.match(empty[0].children[0].text, /הדגמה/);
  assert.equal(empty[0].children[1].dataset.clearRoomFilters, '');
  f.clear();
  assert.equal(f.card.hidden, false);
  assert.ok(f.options.every(option => !option.hidden));
  assert.ok(f.chips.every(chip => chip.attributes['aria-pressed'] === 'false'));
  assert.equal(f.dividers.filter(divider => !divider.hidden).length, 2);
  assert.equal(f.list.children.length, 1);
  assert.equal(f.card.__hotelRoom, f.description);
});

test('missing YGO rooms are not misreported as filtered availability', () => {
  const f = fixture();
  f.card.remove();
  const missingContent = node('hotel-empty-state hotel-room-empty');
  f.list.append(missingContent);
  f.select(1);
  f.apply();
  assert.deepEqual(f.list.children, [missingContent]);
});
