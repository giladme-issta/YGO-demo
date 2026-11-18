/* site-header.js
 * Responsibility: UI-only interaction for the global header.
 *
 * Inputs  (DOM, scoped to .site-header):
 *   - click on .site-header__login  → toggles the login menu open/closed
 * Outputs (CustomEvent, bubbling from .site-header):
 *   - "site-header:login-toggle"  detail: { open: boolean }
 *
 * No data, no navigation logic, no dependencies on other components.
 */
(function () {
  var root = document.querySelector('.site-header');
  if (!root) return;

  var login = root.querySelector('.site-header__login');
  if (!login) return;

  login.addEventListener('click', function () {
    var open = login.classList.toggle('is-open');
    root.dispatchEvent(new CustomEvent('site-header:login-toggle', {
      bubbles: true,
      detail: { open: open }
    }));
  });
})();
