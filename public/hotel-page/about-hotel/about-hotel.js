/* about-hotel.js
 * Responsibility: UI-only — expand / collapse the hotel description.
 * Collapsed: the whole description (all paragraphs) clamped to 4 lines.
 * Expanded: the full text. The link flips "לראות עוד" ↔ "הצג פחות".
 * If the copy fits in 4 lines anyway, the link is hidden.
 *
 * Inputs (DOM, scoped to .about-hotel):
 *   - [data-about-text]   the description container (clamped by default)
 *   - click [data-about-toggle]
 * Outputs: none. Purely presentational.
 */
(function () {
  var root = document.querySelector('.about-hotel');
  if (!root) return;

  var desc = root.querySelector('[data-about-text]');
  var toggleBtn = root.querySelector('[data-about-toggle]');
  if (!toggleBtn || !desc) return;
  var actions = toggleBtn.closest('.about-hotel__actions') || toggleBtn;
  var CLAMP = 'about-hotel__desc--clamped';

  function isExpanded() { return toggleBtn.getAttribute('aria-expanded') === 'true'; }

  // hide the toggle when the collapsed text isn't actually cut
  function syncToggle() {
    if (isExpanded()) return;
    actions.hidden = desc.scrollHeight <= desc.clientHeight + 1;
  }

  toggleBtn.addEventListener('click', function () {
    var expanded = !isExpanded();
    desc.classList.toggle(CLAMP, !expanded);
    toggleBtn.setAttribute('aria-expanded', String(expanded));
    toggleBtn.textContent = expanded ? 'הצג פחות' : 'לראות עוד';
  });

  syncToggle();
  window.addEventListener('resize', syncToggle);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncToggle);
})();
