/* hotel-experiences.js — UI-only. Phase 1: each card's "מידע נוסף" button just
 * announces intent; a later phase opens the experience's detail view / gallery.
 *
 * Output (CustomEvent, bubbling):
 *   - "hotel-experiences:more"  detail: { experience }
 */
(function () {
  document.querySelectorAll('.hotel-experiences__more').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.dispatchEvent(new CustomEvent('hotel-experiences:more', {
        bubbles: true, detail: { experience: btn.getAttribute('data-exp') }
      }));
    });
  });
})();
