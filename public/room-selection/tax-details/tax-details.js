/* tax-details.js
 * Responsibility: UI-only — open the tax breakdown from a tariff's
 * "לפירוט מחיר ומיסים" link (a tooltip on desktop, a bottom drawer on mobile),
 * and open the booking-terms popup from the "terms" variant. It only reads a
 * data-tax-type flag off the trigger to pick which variant to show.
 *
 * Inputs (DOM):
 *   - click .room-option__details   (data-tax-type="prices" | "terms")
 *   - clicks: close buttons / backdrops, the terms link
 *   - Esc / outside-click / scroll / resize → close
 * Outputs: none.
 */
(function () {
  var tip = document.getElementById('tax-details');
  var terms = document.getElementById('tax-terms');
  if (!tip) return;

  var variants = Array.prototype.slice.call(tip.querySelectorAll('[data-tax-variant]'));
  var currentTrigger = null;
  var isMobile = function () { return window.matchMedia('(max-width: 700px)').matches; };

  function showVariant(type) {
    variants.forEach(function (v) { v.hidden = v.getAttribute('data-tax-variant') !== type; });
  }

  function positionDesktop(trigger) {
    var tr = trigger.getBoundingClientRect();
    var grid = document.querySelector('.room-selection');
    var gr = grid ? grid.getBoundingClientRect()
                  : { left: 0, right: document.documentElement.clientWidth };
    var w = tip.offsetWidth;
    var left = tr.left + window.scrollX;                 // left-align to the link → opens rightward, inside the grid
    var minLeft = gr.left + window.scrollX + 4;
    var maxLeft = gr.right + window.scrollX - w - 4;
    left = Math.max(minLeft, Math.min(left, maxLeft));
    tip.style.left = left + 'px';
    tip.style.top = (tr.bottom + window.scrollY + 10) + 'px';
    // keep the arrow pointing at the link even after clamping
    var arrow = (tr.left + tr.width / 2 + window.scrollX) - left;
    tip.style.setProperty('--arrow-x', Math.max(16, Math.min(w - 16, arrow)) + 'px');
  }

  function openTip(trigger) {
    currentTrigger = trigger;
    var host = trigger.closest('[data-tax-type]');   // the flag lives on the room card
    showVariant((host && host.getAttribute('data-tax-type')) || 'prices');
    tip.style.top = '';
    tip.style.left = '';
    tip.hidden = false;
    tip.setAttribute('aria-hidden', 'false');
    if (isMobile()) {
      document.body.style.overflow = 'hidden';         // drawer: CSS pins it to the bottom
    } else {
      positionDesktop(trigger);                        // tooltip: anchor under the link
    }
  }
  function closeTip() {
    tip.hidden = true;
    tip.setAttribute('aria-hidden', 'true');
    currentTrigger = null;
    if (!terms || terms.hidden) document.body.style.overflow = '';
  }

  function resetTerms() {                               // collapse the "המשך קריאה" section
    if (!terms) return;
    var more = terms.querySelector('.tax-terms__more');
    var btn = terms.querySelector('[data-tt-toggle]');
    var dialog = terms.querySelector('.tax-terms__dialog');
    if (more) more.hidden = true;
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'המשך קריאה'; }
    if (dialog) dialog.scrollTop = 0;
  }
  function toggleTerms() {                               // reveal / hide the extra text; the dialog grows
    if (!terms) return;
    var more = terms.querySelector('.tax-terms__more');
    var btn = terms.querySelector('[data-tt-toggle]');
    if (!more || !btn) return;
    var willExpand = more.hidden;
    more.hidden = !willExpand;
    btn.setAttribute('aria-expanded', String(willExpand));
    btn.textContent = willExpand ? 'הצג פחות' : 'המשך קריאה';
  }

  function openTerms() {
    if (!terms) return;
    resetTerms();                                        // always open collapsed
    terms.hidden = false;
    terms.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeTerms() {
    if (!terms) return;
    terms.hidden = true;
    terms.setAttribute('aria-hidden', 'true');
    if (tip.hidden) document.body.style.overflow = '';
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('.room-option__details');
    if (trigger) {
      e.preventDefault();
      if (!tip.hidden && currentTrigger === trigger) { closeTip(); return; }   // toggle off
      openTip(trigger);
      return;
    }
    if (e.target.closest('[data-tax-terms]')) { closeTip(); openTerms(); return; }
    if (e.target.closest('[data-tax-close]')) { closeTip(); return; }
    if (e.target.closest('[data-tt-toggle]')) { toggleTerms(); return; }
    if (e.target.closest('[data-tt-close]')) { closeTerms(); return; }
    // click outside the desktop tooltip closes it (mobile uses the backdrop)
    if (!tip.hidden && !isMobile() && !e.target.closest('#tax-details')) closeTip();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (terms && !terms.hidden) { closeTerms(); return; }
    if (!tip.hidden) closeTip();
  });

  // the desktop tooltip is anchored to the page — dismiss it on scroll / resize
  window.addEventListener('scroll', function () { if (!tip.hidden && !isMobile()) closeTip(); }, true);
  window.addEventListener('resize', function () { if (!tip.hidden) closeTip(); });
})();
