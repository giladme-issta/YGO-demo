import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../public/hotel-page/hotel-app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/hotel-page/index.html', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../public/hotel-page/hotel-app.css', import.meta.url), 'utf8');
const aboutCss = readFileSync(new URL('../public/hotel-page/about-hotel/about-hotel.css', import.meta.url), 'utf8');
const facilitiesCss = readFileSync(new URL('../public/hotel-page/facilities/facilities.css', import.meta.url), 'utf8');
const clearHotelData = app.slice(app.indexOf('function clearHotelData()'), app.indexOf('function setMissingSections()'));
const renderHotel = app.slice(app.indexOf('function renderHotel('), app.indexOf('function errorMessage('));

function fixture() {
  const section = { hidden: true };
  const context = vm.createContext({
    $: selector => selector === '.hotel-kosher' ? section : null,
    $$: () => [],
    clear() {},
    text() {},
    setStars() {},
    setRatingBadge() {},
    hotelMap: { setHotel() {} },
    renderReviews() {},
    currentHotel: null,
    galleryImages: [],
    activeRoom: null,
    conversationMessages: [],
    document: { title: '', body: { dataset: {} } },
    updateHotelIdentity() {},
    applyAiState() {},
    renderGallery() {},
    renderAbout() {},
    renderHighlights() {},
    renderFacilities() {},
    renderLocation() {},
    renderMap() {},
    renderRooms() {},
    renderPolicies() {},
    renderExperiences() {},
    renderSuggestions() {},
    setStatus() {},
  });
  vm.runInContext(`${clearHotelData}\n${renderHotel}`, context);
  return { section, context };
}

test('traditional-observance section is shown only for hotel 22362808', () => {
  const f = fixture();
  f.context.renderHotel({ id: '22362808' }, null);
  assert.equal(f.section.hidden, false);
  f.context.renderHotel({ id: '4458386' }, null);
  assert.equal(f.section.hidden, true);
});

test('clearing hotel data hides the section during loading and after failed requests', () => {
  const f = fixture();
  f.section.hidden = false;
  f.context.clearHotelData();
  assert.equal(f.section.hidden, true);
});

test('section remains between about and facilities in mobile flow', () => {
  const about = html.indexOf('<section class="about-hotel"');
  const kosher = html.indexOf('<section class="hotel-kosher"');
  const facilities = html.indexOf('<section class="facilities"');
  assert.ok(about >= 0 && about < kosher && kosher < facilities);
  assert.match(aboutCss, /\.about-hotel,\s*\.hotel-kosher\s*\{\s*order:\s*5\s*;\s*\}/);
  assert.match(facilitiesCss, /\.facilities\s*\{\s*order:\s*6;/);
});

test('demo note uses the existing about-section source-note styling', () => {
  assert.match(html, /<p class="hotel-kosher__source-note">הטקסט להמחשה בלבד<\/p>/);
  assert.match(appCss, /\.about-hotel__source-note,\s*\.hotel-kosher__source-note\s*\{/);
});
