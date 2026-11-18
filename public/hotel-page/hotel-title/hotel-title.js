/* hotel-title.js
 * Responsibility: UI-only interaction for the deal-title block.
 *
 * Inputs  (DOM, scoped to .hotel-title):
 *   - click on a .hotel-title__tab   → mark it active (visual only)
 *   - click on .hotel-title__cta      → announce a "choose room" request
 * Outputs (CustomEvent, bubbling from .hotel-title):
 *   - "hotel-title:tab-change"   detail: { tab: string }   e.g. "gallery"
 *   - "hotel-title:select-room"  detail: { package: "hotel" | "flight" }
 *
 * Purely presentational: no scrolling, no routing, no data.
 */
(function () {
  var root = document.querySelector('.hotel-title');
  if (!root) return;

  var tabs = root.querySelectorAll('.hotel-title__tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      root.dispatchEvent(new CustomEvent('hotel-title:tab-change', {
        bubbles: true,
        detail: { tab: tab.getAttribute('data-tab') }
      }));
    });
  });

  var ctas = root.querySelectorAll('.hotel-title__cta');
  ctas.forEach(function (cta) {
    cta.addEventListener('click', function () {
      root.dispatchEvent(new CustomEvent('hotel-title:select-room', {
        bubbles: true, detail: { package: cta.getAttribute('data-package') || '' }
      }));
    });
  });
})();
