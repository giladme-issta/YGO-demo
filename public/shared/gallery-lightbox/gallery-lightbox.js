/* gallery-lightbox.js  — SHARED across ISSTA modules
 * Responsibility: UI-only — open/close a full-screen photo viewer and move
 * between photos. Self-contained: by default its photos come from its own
 * thumbnails, never from another component's DOM. A caller may instead pass
 * its own photo set (e.g. a facility category) — the default set is restored
 * the next time the lightbox opens without one.
 *
 * Inputs:
 *   - document event "gallery-lightbox:open"
 *       detail: { index: number | "all", photos?: [{ src, alt }] }
 *   - internal clicks: thumbnail, prev/next arrows, close button, backdrop
 *   - keyboard while open: Esc = close, ArrowRight/ArrowLeft = navigate
 *   - touch: horizontal swipe on the stage = navigate
 * Outputs:
 *   - none (self-contained overlay). Focus moves to the close button on open
 *     and returns to the opener on close.
 */
(function () {
  var root = document.getElementById('gallery-lightbox');
  if (!root) return;

  var imageEl    = root.querySelector('[data-lb-image]');
  var currentEl  = root.querySelector('[data-lb-current]');
  var totalEl    = root.querySelector('[data-lb-total]');
  var thumbsWrap = root.querySelector('[data-lb-thumbs]');
  var closeBtn   = root.querySelector('.gallery-lightbox__close');
  var defaultSet = thumbsWrap ? thumbsWrap.innerHTML : '';
  var custom     = false;
  var thumbs = [], srcs = [], alts = [];
  var current    = 0;
  var lastFocus  = null;

  // (re)read the photo list from the thumbnails and wire them
  function bindThumbs() {
    thumbs = Array.prototype.slice.call(root.querySelectorAll('[data-lb-thumb]'));
    srcs = thumbs.map(function (t) { return t.querySelector('img').getAttribute('src'); });
    alts = thumbs.map(function (t) { return t.querySelector('img').getAttribute('alt') || ''; });
    totalEl.textContent = String(srcs.length);
    thumbs.forEach(function (t, i) {
      t.addEventListener('click', function () { current = i; render(); });
    });
  }

  // swap in a caller's photo set, or restore the default one
  function usePhotos(list) {
    if (!thumbsWrap) return;
    if (list && list.length) {
      thumbsWrap.innerHTML = '';
      list.forEach(function (p) {
        var b = document.createElement('button');
        b.className = 'gallery-lightbox__thumb';
        b.type = 'button';
        b.setAttribute('data-lb-thumb', '');
        var img = document.createElement('img');
        img.src = p.src;
        img.alt = p.alt || '';
        b.appendChild(img);
        thumbsWrap.appendChild(b);
      });
      custom = true;
      bindThumbs();
    } else if (custom) {
      thumbsWrap.innerHTML = defaultSet;
      custom = false;
      bindThumbs();
    }
  }

  function render() {
    imageEl.setAttribute('src', srcs[current]);
    imageEl.setAttribute('alt', alts[current] || '');
    currentEl.textContent = String(current + 1);
    thumbs.forEach(function (t, i) { t.classList.toggle('is-active', i === current); });
    var active = thumbs[current];
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function open(index, photos) {
    usePhotos(photos);
    current = (typeof index === 'number' && index >= 0 && index < srcs.length) ? index : 0;
    render();
    lastFocus = document.activeElement;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    // only release the scroll lock if no other overlay is still open beneath us
    // (room module: room-details popup · hotel module: category browser, facilities popup)
    var popup = document.getElementById('room-popup');
    var cats  = document.getElementById('gallery-categories');
    var fac   = document.getElementById('fac-modal');
    var otherOpen = (popup && !popup.hidden) || (cats && !cats.hidden) || (fac && !fac.hidden);
    if (!otherOpen) document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  function go(delta) {
    current = (current + delta + srcs.length) % srcs.length;
    render();
  }

  bindThumbs();

  // horizontal swipe on the image (mobile): left = next, right = prev
  var stage = root.querySelector('.gallery-lightbox__stage');
  if (stage) {
    var sx = null;
    stage.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (sx == null) return;
      var dx = e.changedTouches[0].clientX - sx;
      sx = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  // open on any module's announcement
  document.addEventListener('gallery-lightbox:open', function (e) {
    var d = e.detail || {};
    open(d.index === 'all' ? 0 : d.index, d.photos);
  });

  // internal controls
  root.querySelectorAll('[data-lb-close]').forEach(function (el) {
    el.addEventListener('click', close);
  });
  root.querySelector('[data-lb-prev]').addEventListener('click', function () { go(-1); });
  root.querySelector('[data-lb-next]').addEventListener('click', function () { go(1); });

  // keyboard (only while open)
  document.addEventListener('keydown', function (e) {
    if (root.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  });
})();
