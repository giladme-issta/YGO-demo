/* advantages.js — UI-only. On mobile the perks list shows 3 items by default
 * (CSS) with a "לראות עוד" link that expands it downward; desktop shows all 9.
 *
 * Inputs (DOM, scoped to .advantages):
 *   - click [data-adv-toggle] → toggle .is-expanded on the list
 */
(function () {
  var root = document.querySelector('.advantages');
  if (!root) return;
  var list = root.querySelector('.advantages__list');
  var btn = root.querySelector('[data-adv-toggle]');
  if (!list || !btn) return;

  btn.addEventListener('click', function () {
    var expanded = list.classList.toggle('is-expanded');
    btn.setAttribute('aria-expanded', String(expanded));
    btn.textContent = expanded ? 'הצג פחות' : 'לראות עוד';
  });
})();
