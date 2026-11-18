/* hotel-sticky.js
 * Responsibility: UI-only — the on-scroll sticky nav bar (desktop).
 *   1) reveal the bar once the deal-title tabs scroll above the top
 *   2) click any section tab (sticky OR original) → smooth-scroll to its section
 *   3) scroll-spy: the active tab (green underline) tracks the section in view,
 *      on both the sticky and the original tab rows.
 *
 * Inputs (DOM): scroll / resize; clicks on any .hotel-title__tab.
 * Outputs: none.
 */
(function () {
  var sticky = document.getElementById('hotel-sticky');
  if (!sticky) return;

  // a11y: the sticky bar is a visual, on-scroll DUPLICATE of the deal-title nav/price,
  // kept aria-hidden so assistive tech announces the canonical title once. Its controls
  // must therefore stay OUT of the keyboard tab order (the identical title controls stay
  // focusable) — otherwise focus lands on buttons hidden from assistive tech.
  sticky.querySelectorAll('button, a, [tabindex]').forEach(function (el) {
    el.setAttribute('tabindex', '-1');
  });

  var SECTIONS = {
    gallery: 'sec-gallery',
    about: 'sec-about',
    facilities: 'sec-facilities',
    location: 'sec-location',
    rooms: 'sec-rooms',
    reviews: 'sec-reviews'
  };
  var isDesktop = function () { return window.matchMedia('(min-width: 769px)').matches; };
  var barHeight = function () { return isDesktop() ? sticky.getBoundingClientRect().height : 0; };
  var origTabs = document.querySelector('.hotel-title__main .hotel-title__tabs');
  var allTabs = Array.prototype.slice.call(document.querySelectorAll('.hotel-title__tab'));

  // 2) click a tab → scroll to its section (leaving room for the sticky bar)
  allTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var id = SECTIONS[tab.getAttribute('data-tab')];
      var sec = id && document.getElementById(id);
      if (!sec) return;
      var y = sec.getBoundingClientRect().top + window.scrollY - barHeight() - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    });
  });

  function setActive(tabKey) {
    allTabs.forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('data-tab') === tabKey); });
  }

  function onScroll() {
    if (!isDesktop()) { sticky.classList.remove('is-visible'); return; }

    // 1) reveal once the original tabs have scrolled above the top
    var show = origTabs ? origTabs.getBoundingClientRect().bottom <= 0 : window.scrollY > 320;
    sticky.classList.toggle('is-visible', show);

    // 3) scroll-spy: the last section whose top passed the bar line is active
    var keys = Object.keys(SECTIONS);
    var line = barHeight() + 20;
    var current = keys[0];
    keys.forEach(function (key) {
      var sec = document.getElementById(SECTIONS[key]);
      if (sec && sec.getBoundingClientRect().top - line <= 0) current = key;
    });
    // the last section can't reach the top (not enough page below it) → when the
    // page is scrolled to the bottom, treat it as the active one
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = keys[keys.length - 1];
    }
    setActive(current);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
