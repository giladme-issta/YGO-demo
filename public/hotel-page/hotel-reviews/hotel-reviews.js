/* hotel-reviews.js — UI-only. On mobile the card is collapsed (bars + 2 praises);
 * the "לראות עוד" link expands it to the full narrative and flips to "הצג פחות".
 *
 * Inputs (DOM, scoped to .reviews):
 *   - click [data-rev-toggle] → toggle .is-expanded on the section
 */
(function () {
  document.querySelectorAll('.reviews').forEach(function (root) {
    var btn = root.querySelector('[data-rev-toggle]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var expanded = root.classList.toggle('is-expanded');
      btn.setAttribute('aria-expanded', String(expanded));
      btn.textContent = expanded ? 'הצג פחות' : 'לראות עוד';
    });
  });
})();
