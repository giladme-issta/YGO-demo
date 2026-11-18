import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../public/hotel-page/hotel-sticky/hotel-sticky.js', import.meta.url), 'utf8');

test('sticky navigation follows the rendered bar height on desktop and removes its offset on mobile', () => {
  let height = 104;
  let desktop = true;
  const scrolls = [];
  const listeners = {};
  const tab = {
    classList: { toggle() {} },
    getAttribute: () => 'rooms',
    addEventListener: (event, handler) => { listeners[event] = handler; },
  };
  const sticky = {
    classList: { toggle() {}, remove() {} },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ height }),
  };
  const document = {
    documentElement: { scrollHeight: 8000 },
    getElementById: id => id === 'hotel-sticky' ? sticky : { getBoundingClientRect: () => ({ top: 1000 }) },
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: -10 }) }),
    querySelectorAll: () => [tab],
  };
  const window = {
    scrollY: 500, innerHeight: 900,
    matchMedia: () => ({ matches: desktop }),
    scrollTo: value => scrolls.push(value.top),
    addEventListener() {},
  };
  vm.runInNewContext(script, { document, window });
  listeners.click();
  height = 153;
  listeners.click();
  desktop = false;
  listeners.click();
  assert.deepEqual(scrolls, [1384, 1335, 1488]);
});
