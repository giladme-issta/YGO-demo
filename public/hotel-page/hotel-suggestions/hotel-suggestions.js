/* hotel-suggestions.js — the "מלונות שיכולים לעניין אותך" carousel.
 * Native horizontal scroll (RTL): mobile swipes with a finger; desktop arrows page
 * the whole row one viewport at a time with a smooth slide. Arrows are vertically
 * centred on the card IMAGE and disable at the ends. No dependencies. */
(function () {
  var GAP = 13;

  function initCarousel(root) {
    var viewport = root.querySelector('.hotel-suggestions__viewport');
    var track = root.querySelector('.hotel-suggestions__track');
    var prev = root.querySelector('.hotel-suggestions__arrow--prev');   // RTL: right, goes back
    var next = root.querySelector('.hotel-suggestions__arrow--next');   // RTL: left, goes forward
    if (!viewport || !track) return;

    function cardStep() {
      var card = track.querySelector('.hotel-suggestions__slide');
      return card ? card.getBoundingClientRect().width + GAP : viewport.clientWidth;
    }
    function pageAmount() {
      var per = Math.max(1, Math.round(viewport.clientWidth / cardStep()));
      return per * cardStep();
    }

    // put the arrows on the vertical middle of the IMAGE (not the whole card)
    function positionArrows() {
      var media = track.querySelector('.suggestion-card__media');
      if (!media || !prev) return;
      var top = media.getBoundingClientRect().top - root.getBoundingClientRect().top + media.offsetHeight / 2;
      prev.style.top = next.style.top = top + 'px';
    }

    // RTL: scrollLeft is 0 at the start (fully right) and negative toward the end (left)
    function updateArrows() {
      if (!prev) return;
      var max = viewport.scrollWidth - viewport.clientWidth;       // > 0 when it overflows
      var x = viewport.scrollLeft;                                  // 0 .. -max in RTL
      var atStart = x >= -5;
      var atEnd = x <= -(max - 5);
      var noScroll = max <= 5;
      prev.disabled = atStart || noScroll;
      next.disabled = atEnd || noScroll;
    }

    if (prev) prev.addEventListener('click', function () { viewport.scrollBy({ left: pageAmount(), behavior: 'smooth' }); });
    if (next) next.addEventListener('click', function () { viewport.scrollBy({ left: -pageAmount(), behavior: 'smooth' }); });

    viewport.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', function () { positionArrows(); updateArrows(); });

    positionArrows();
    updateArrows();
    // re-measure once the demo image has loaded (image height affects the arrow centre)
    var img = track.querySelector('.suggestion-card__img');
    if (img && !img.complete) img.addEventListener('load', positionArrows);
  }

  document.querySelectorAll('.hotel-suggestions__carousel').forEach(initCarousel);
})();
