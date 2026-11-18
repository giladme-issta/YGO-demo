/* stay-modify.js — UI-only. The dates/guests fields and the "בדיקת זמינות" button
 * only announce intent; a host app re-checks this hotel's availability.
 *
 * Outputs (CustomEvent, bubbling from .stay-modify):
 *   - "stay-modify:edit-field"  detail: { field: "dates"|"passengers" }
 *   - "stay-modify:submit"      detail: {}
 */
(function () {
  document.querySelectorAll('.stay-modify').forEach(function (root) {
    root.querySelectorAll('.stay-modify__field').forEach(function (field) {
      field.addEventListener('click', function () {
        root.dispatchEvent(new CustomEvent('stay-modify:edit-field', {
          bubbles: true, detail: { field: field.getAttribute('data-field') }
        }));
      });
    });
    var submit = root.querySelector('.stay-modify__submit');
    if (submit) {
      submit.addEventListener('click', function () {
        root.dispatchEvent(new CustomEvent('stay-modify:submit', { bubbles: true, detail: {} }));
      });
    }
  });
})();
