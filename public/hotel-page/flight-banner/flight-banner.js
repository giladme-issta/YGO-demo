/* flight-banner.js
 * Responsibility: emit an intent event when the guest taps "להוספת טיסה".
 * The banner has no internal state; the real flight-add flow is wired by the
 * dev. Kept minimal so the CTA is a working control, not a dead button.
 *
 * Output (DOM CustomEvent, bubbles): `flight-banner:add`  detail: {}
 */
(function () {
  var cta = document.querySelector('.flight-banner__cta');
  if (!cta) return;
  cta.addEventListener('click', function () {
    cta.dispatchEvent(new CustomEvent('flight-banner:add', { bubbles: true, detail: {} }));
  });
})();
