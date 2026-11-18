/* room-filters.js
 * Responsibility: UI-only — toggle the active state of each filter chip.
 *
 * Inputs:
 *   - click on a .filter-chip (scoped to .room-filters)
 * Outputs:
 *   - toggles .filter-chip--active + aria-pressed on the clicked chip.
 *     (A host reads aria-pressed / listens for clicks to run the real filter.)
 */
(function () {
  var root = document.querySelector('.room-filters');
  if (!root) return;

  root.querySelectorAll('.filter-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var active = chip.classList.toggle('filter-chip--active');
      chip.setAttribute('aria-pressed', active);
    });
  });
})();
