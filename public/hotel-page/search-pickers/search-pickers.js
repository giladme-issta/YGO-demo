/* search-pickers.js — real date-range calendar + rooms/guests picker, shared by
 * the top search bar (.search-summary) and the "change dates" engine
 * (.stay-modify). UI-only: selections update the field labels across BOTH
 * engines and announce intent; a host app re-checks availability.
 *
 * Built from the Figma date-picker + "מגירת אורחים" designs, using site tokens.
 * Desktop: dropdown anchored to the field. Mobile (<=768px): bottom sheet.
 *
 * Events (bubbling from document):
 *   - "search-pickers:dates-change"  detail: { checkIn, checkOut }   (Date objs)
 *   - "search-pickers:guests-change" detail: { rooms, adults, children }
 */
(function () {
  'use strict';

  /* ---------- constants ---------- */
  var HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                   'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  var HE_DOW   = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];       // Sun..Sat (grid header)
  var HE_DOW_F = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']; // for "יום ג׳"

  var MAX_ROOMS = 4, MAX_ADULTS = 9, MAX_CHILDREN = 6, CHILD_DEFAULT_AGE = 8;

  var ICON = {
    prev: '<svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 1.5l5 4.5-5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 1.5l-5 4.5 5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2.5v11M2.5 8h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    minus:'<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 8h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    close:'<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  /* ---------- date helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function sod(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function sameDay(a, b) {
    return !!a && !!b && a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtShort(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function fmtLong(d) {
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2) +
           ' יום ' + HE_DOW_F[d.getDay()];
  }
  function isMobile() { return window.matchMedia('(max-width: 768px)').matches; }

  /* ---------- shared state ---------- */
  var state = {
    checkIn: new Date(2026, 4, 28),
    checkOut: new Date(2026, 4, 31),
    active: 'in',                 // which endpoint the next click sets ('in' = start fresh)
    viewDate: new Date(2026, 4, 1),
    rooms: [{ adults: 2, children: [] }]
  };
  var hoverDate = null;

  // seed from the live field text, if present
  (function seed() {
    var f = document.querySelector('.stay-modify [data-field="dates"] .stay-modify__text') ||
            document.querySelector('.search-summary [data-field="dates"] .search-summary__text');
    if (f) {
      var m = (f.textContent || '').match(/(\d{1,2})\/(\d{1,2})/g);
      if (m && m.length >= 2) {
        var a = m[0].split('/'), b = m[1].split('/');
        var yr = new Date().getFullYear();
        state.checkIn  = new Date(yr, +a[1] - 1, +a[0]);
        state.checkOut = new Date(yr, +b[1] - 1, +b[0]);
        state.viewDate = new Date(state.checkIn.getFullYear(), state.checkIn.getMonth(), 1);
      }
    }
  })();

  /* ---------- field text updates (both engines) ---------- */
  function applyDatesUI() {
    var ci = state.checkIn, co = state.checkOut;
    var shortTxt = (ci && co) ? (fmtShort(ci) + ' – ' + fmtShort(co))
                              : (ci ? fmtShort(ci) : 'בחירת תאריכים');
    var longTxt  = (ci && co) ? (fmtLong(ci) + ' - ' + fmtLong(co))
                              : (ci ? fmtLong(ci) : 'בחירת תאריכים');

    document.querySelectorAll('.stay-modify [data-field="dates"] .stay-modify__text')
      .forEach(function (el) { el.textContent = shortTxt; });
    document.querySelectorAll('.search-summary [data-field="dates"] .search-summary__text')
      .forEach(function (el) { el.textContent = longTxt; });

    var cdates = document.querySelectorAll('.search-summary__compact .search-summary__cdate');
    if (cdates.length >= 2 && ci && co) { setCdate(cdates[0], ci); setCdate(cdates[1], co); }
  }
  function setCdate(node, d) {
    var sp = node.querySelectorAll('span');
    if (sp[0]) sp[0].textContent = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2);
    if (sp[1]) sp[1].textContent = 'יום ' + HE_DOW_F[d.getDay()];
  }

  function guestTotals() {
    var a = 0, c = 0;
    state.rooms.forEach(function (r) { a += r.adults; c += r.children.length; });
    return { adults: a, children: c, rooms: state.rooms.length };
  }
  function guestsSummary() {
    var t = guestTotals(), parts = [t.adults + ' ' + (t.adults === 1 ? 'מבוגר' : 'מבוגרים')];
    if (t.children > 0) parts.push(t.children + ' ' + (t.children === 1 ? 'ילד' : 'ילדים'));
    parts.push(t.rooms + ' ' + (t.rooms === 1 ? 'חדר' : 'חדרים'));
    return parts.join(', ');
  }
  function applyGuestsUI() {
    var t = guestTotals(), s = guestsSummary();
    document.querySelectorAll('.stay-modify [data-field="passengers"] .stay-modify__text')
      .forEach(function (el) { el.textContent = s; });
    document.querySelectorAll('.search-summary [data-field="passengers"] .search-summary__text')
      .forEach(function (el) { el.textContent = s; });

    var cpax = document.querySelector('.search-summary__compact .search-summary__cpax');
    if (cpax) {
      var sp = cpax.querySelectorAll('span');
      if (sp[0]) sp[0].textContent = t.adults + ' ' + (t.adults === 1 ? 'מבוגר' : 'מבוגרים') +
                                     (t.children ? ', ' + t.children + ' ' + (t.children === 1 ? 'ילד' : 'ילדים') : '');
      if (sp[1]) sp[1].textContent = t.rooms + ' ' + (t.rooms === 1 ? 'חדר' : 'חדרים');
    }
  }

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail }));
  }

  /* ---------- popover shell ---------- */
  var wrap, backdrop, panel, sheetTitle, body;
  var activeKind = null, activeAnchor = null;

  function buildShell() {
    wrap = document.createElement('div');
    wrap.className = 'sp-pop';
    wrap.setAttribute('dir', 'rtl');
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="sp-backdrop"></div>' +
      '<div class="sp-pop__panel" role="dialog" aria-modal="true" tabindex="-1">' +
        '<div class="sp-sheet-head"><span class="sp-sheet-head__title"></span>' +
          '<button type="button" class="sp-sheet-close" aria-label="סגירה">' + ICON.close + '</button></div>' +
        '<div class="sp-pop__body"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    backdrop   = wrap.querySelector('.sp-backdrop');
    panel      = wrap.querySelector('.sp-pop__panel');
    sheetTitle = wrap.querySelector('.sp-sheet-head__title');
    body       = wrap.querySelector('.sp-pop__body');

    backdrop.addEventListener('click', closePop);
    wrap.querySelector('.sp-sheet-close').addEventListener('click', closePop);
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  function position() {
    if (isMobile()) { panel.style.top = ''; panel.style.left = ''; return; }
    var r = activeAnchor.getBoundingClientRect();
    var w = panel.offsetWidth;
    var vw = document.documentElement.clientWidth;
    // keep the panel inside the engine's own grid/container, never spilling past it
    var boxEl = activeAnchor.closest('.room-toolbar, .search-summary__inner, .band__inner');
    var bl = 8, br = vw - 8;
    if (boxEl) { var bx = boxEl.getBoundingClientRect(); bl = Math.max(8, bx.left); br = Math.min(vw - 8, bx.right); }
    var left = r.right - w;            // RTL: align the panel's right edge to the field's right edge
    if (left + w > br) left = br - w;  // don't spill past the grid / viewport on the right
    if (left < bl) left = bl;          // align to the grid's LEFT boundary instead of overflowing left
    panel.style.top = (r.bottom + window.scrollY + 8) + 'px';
    panel.style.left = (left + window.scrollX) + 'px';
  }

  function openPop(kind, anchor) {
    if (!wrap) buildShell();
    if (activeAnchor === anchor && !wrap.hidden) { closePop(); return; }
    activeKind = kind; activeAnchor = anchor;
    if (kind === 'dates') {
      sheetTitle.textContent = 'בחירת תאריכים';
      panel.setAttribute('aria-label', 'בחירת תאריכים');
      renderCal();
    } else {
      sheetTitle.textContent = 'אורחים וחדרים';
      panel.setAttribute('aria-label', 'אורחים וחדרים');
      renderGuests();
    }
    wrap.hidden = false;
    position();
    var focusable = panel.querySelector('button:not([disabled]), select, [tabindex]');
    if (focusable) focusable.focus();
  }

  function closePop() {
    if (!wrap || wrap.hidden) return;
    wrap.hidden = true;
    hoverDate = null;
    var a = activeAnchor;
    activeAnchor = null; activeKind = null;
    if (a && typeof a.focus === 'function') a.focus();
  }

  /* ---------- calendar ---------- */
  function monthGrid(viewY, viewM) {
    var first = new Date(viewY, viewM, 1);
    var offset = first.getDay();               // 0=Sun -> leading empties (rtl => right side)
    var days = new Date(viewY, viewM + 1, 0).getDate();
    var html = '<div class="sp-cal__dow">';
    for (var i = 0; i < 7; i++) html += '<span>' + HE_DOW[i] + '</span>';
    html += '</div><div class="sp-cal__grid">';
    for (var e = 0; e < offset; e++) html += '<span class="sp-cal__day sp-cal__day--empty"></span>';
    for (var d = 1; d <= days; d++) {
      var date = new Date(viewY, viewM, d);
      html += '<button type="button" class="sp-cal__day" data-date="' + iso(date) +
              '" aria-label="' + d + ' ב' + HE_MONTHS[viewM] + ' ' + viewY + '"><span>' + d + '</span></button>';
    }
    html += '</div>';
    return html;
  }

  function renderCal() {
    var v = state.viewDate;
    var m2 = addMonths(v, 1);
    var ci = state.checkIn, co = state.checkOut;
    body.innerHTML =
      '<div class="sp-cal">' +
        '<div class="sp-cal__head">' +
          chip('כניסה', ci, state.active === 'in') +
          chip('יציאה', co, state.active === 'out') +
        '</div>' +
        '<div class="sp-cal__nav">' +
          '<button type="button" class="sp-cal__arrow" data-nav="-1" aria-label="חודש קודם">' + ICON.prev + '</button>' +
          '<div class="sp-cal__titles">' +
            '<div class="sp-cal__title">' + HE_MONTHS[v.getMonth()] + ' ' + v.getFullYear() + '</div>' +
            '<div class="sp-cal__title">' + HE_MONTHS[m2.getMonth()] + ' ' + m2.getFullYear() + '</div>' +
          '</div>' +
          '<button type="button" class="sp-cal__arrow" data-nav="1" aria-label="חודש הבא">' + ICON.next + '</button>' +
        '</div>' +
        '<div class="sp-cal__months">' +
          // each month also carries its own name — shown only on mobile, where the
          // months stack and the side-by-side title row (with the arrows) is hidden
          '<div class="sp-cal__month"><div class="sp-cal__mtitle">' + HE_MONTHS[v.getMonth()] + ' ' + v.getFullYear() + '</div>' + monthGrid(v.getFullYear(), v.getMonth()) + '</div>' +
          '<div class="sp-cal__month"><div class="sp-cal__mtitle">' + HE_MONTHS[m2.getMonth()] + ' ' + m2.getFullYear() + '</div>' + monthGrid(m2.getFullYear(), m2.getMonth()) + '</div>' +
        '</div>' +
        '<div class="sp-cal__foot"><button type="button" class="sp-apply" data-apply="dates">בחירה</button></div>' +
      '</div>';
    paintRange();
  }

  function chip(label, d, active) {
    return '<div class="sp-cal__chip' + (active ? ' sp-cal__chip--active' : '') + '">' +
      '<span class="sp-cal__chip-k">' + label + '</span>' +
      (d ? '<span class="sp-cal__chip-v">' + fmtLong(d) + '</span>'
         : '<span class="sp-cal__chip-v sp-cal__chip-v--empty">בחירת תאריך</span>') +
      '</div>';
  }

  function paintRange() {
    var a = state.checkIn, b = state.checkOut;
    if (a && !b && hoverDate && hoverDate > a) b = hoverDate;   // live preview
    panel.querySelectorAll('.sp-cal__day[data-date]').forEach(function (btn) {
      btn.classList.remove('in-range', 'is-start', 'is-end', 'round-r', 'round-l');
      var d = fromIso(btn.getAttribute('data-date'));
      var inR = a && b && d >= a && d <= b;
      if (inR) {
        btn.classList.add('in-range');
        if (sameDay(d, a) || d.getDay() === 0) btn.classList.add('round-r');
        if (sameDay(d, b) || d.getDay() === 6) btn.classList.add('round-l');
      }
      if (sameDay(d, a)) btn.classList.add('is-start');
      if (b && sameDay(d, b)) btn.classList.add('is-end');
    });
  }

  function pickDay(d) {
    var day = sod(d);
    if (!state.checkIn || state.checkOut) {
      state.checkIn = day; state.checkOut = null; state.active = 'out';
    } else if (day <= state.checkIn) {
      state.checkIn = day; state.checkOut = null; state.active = 'out';
    } else {
      state.checkOut = day; state.active = 'in';
      applyDatesUI();
      emit('search-pickers:dates-change', { checkIn: state.checkIn, checkOut: state.checkOut });
      if (!isMobile()) { closePop(); return; }
    }
    renderCal();
  }

  /* ---------- guests ---------- */
  function renderGuests() {
    var html = '<div class="sp-guests"><div class="sp-guests__scroll">';
    state.rooms.forEach(function (room, i) {
      html += '<div class="sp-room" data-room="' + i + '">' +
        '<div class="sp-room__head"><span class="sp-room__title">חדר ' + (i + 1) + '</span>' +
          (i > 0 ? '<button type="button" class="sp-room__remove" data-remove="' + i + '">הסרה</button>' : '') +
        '</div>' +
        row(i, 'adults',   'מבוגר', 'גיל 18+', room.adults, room.adults <= 1) +
        row(i, 'children', 'ילד', 'מתחת ל-18', room.children.length, room.children.length <= 0) +
        ages(i, room.children) +
      '</div>';
    });
    html += '</div><div class="sp-guests__foot">' +
      '<button type="button" class="sp-guests__add" data-add' + (state.rooms.length >= MAX_ROOMS ? ' disabled' : '') + '>+ הוספת חדר</button>' +
      '<button type="button" class="sp-apply" data-apply="guests">בחירה</button>' +
    '</div></div>';
    body.innerHTML = html;
  }

  function row(roomIdx, type, label, sub, val, minDisabled) {
    var maxVal = type === 'adults' ? MAX_ADULTS : MAX_CHILDREN;
    return '<div class="sp-row"><span class="sp-row__label">' + label + ' <small>(' + sub + ')</small></span>' +
      '<span class="sp-step">' +
        '<button type="button" class="sp-step__btn" data-room="' + roomIdx + '" data-type="' + type + '" data-dir="-1" aria-label="הפחתה"' + (minDisabled ? ' disabled' : '') + '>' + ICON.minus + '</button>' +
        '<span class="sp-step__val" aria-live="polite">' + val + '</span>' +
        '<button type="button" class="sp-step__btn" data-room="' + roomIdx + '" data-type="' + type + '" data-dir="1" aria-label="הוספה"' + (val >= maxVal ? ' disabled' : '') + '>' + ICON.plus + '</button>' +
      '</span></div>';
  }

  function ages(roomIdx, children) {
    if (!children.length) return '';
    var h = '<div class="sp-ages">';
    children.forEach(function (age, j) {
      h += '<label class="sp-ages__sel"><select data-room="' + roomIdx + '" data-age="' + j + '" aria-label="גיל הילד">';
      for (var a = 0; a <= 17; a++) h += '<option value="' + a + '"' + (a === age ? ' selected' : '') + '>גיל ' + a + '</option>';
      h += '</select></label>';
    });
    return h + '</div>';
  }

  function stepGuest(roomIdx, type, dir) {
    var room = state.rooms[roomIdx];
    if (!room) return;
    if (type === 'adults') {
      room.adults = Math.min(MAX_ADULTS, Math.max(1, room.adults + dir));
    } else {
      if (dir > 0 && room.children.length < MAX_CHILDREN) room.children.push(CHILD_DEFAULT_AGE);
      else if (dir < 0 && room.children.length > 0) room.children.pop();
    }
    renderGuests();
  }

  /* ---------- delegated interactions inside the panel ---------- */
  function onBodyClick(e) {
    var t = e.target;
    var nav = t.closest && t.closest('[data-nav]');
    if (nav) { state.viewDate = addMonths(state.viewDate, +nav.getAttribute('data-nav')); renderCal(); return; }

    var day = t.closest && t.closest('.sp-cal__day[data-date]');
    if (day) { pickDay(fromIso(day.getAttribute('data-date'))); return; }

    var step = t.closest && t.closest('.sp-step__btn');
    if (step && !step.disabled) { stepGuest(+step.getAttribute('data-room'), step.getAttribute('data-type'), +step.getAttribute('data-dir')); return; }

    var add = t.closest && t.closest('[data-add]');
    if (add && !add.disabled) { if (state.rooms.length < MAX_ROOMS) { state.rooms.push({ adults: 2, children: [] }); renderGuests(); } return; }

    var rem = t.closest && t.closest('[data-remove]');
    if (rem) { state.rooms.splice(+rem.getAttribute('data-remove'), 1); renderGuests(); return; }

    var apply = t.closest && t.closest('[data-apply]');
    if (apply) {
      if (apply.getAttribute('data-apply') === 'guests') {
        applyGuestsUI();
        emit('search-pickers:guests-change', guestTotals());
      } else {
        applyDatesUI();
        emit('search-pickers:dates-change', { checkIn: state.checkIn, checkOut: state.checkOut });
      }
      closePop();
    }
  }

  function onBodyChange(e) {
    var sel = e.target.closest && e.target.closest('select[data-age]');
    if (sel) {
      var room = state.rooms[+sel.getAttribute('data-room')];
      if (room) room.children[+sel.getAttribute('data-age')] = +sel.value;
    }
  }

  function onBodyHover(e) {
    if (activeKind !== 'dates' || !state.checkIn || state.checkOut) return;
    var day = e.target.closest && e.target.closest('.sp-cal__day[data-date]');
    var next = day ? fromIso(day.getAttribute('data-date')) : null;
    if ((next && !sameDay(next, hoverDate)) || (!next && hoverDate)) { hoverDate = next; paintRange(); }
  }

  /* ---------- open triggers (both engines) ---------- */
  function wireTrigger(el, kind) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();          // don't let the outside-click handler see this click
      openPop(kind, el);
    });
  }
  function wire() {
    buildShell();
    body.addEventListener('click', onBodyClick);
    body.addEventListener('change', onBodyChange);
    body.addEventListener('mouseover', onBodyHover);
    body.addEventListener('mouseleave', function () { if (hoverDate) { hoverDate = null; paintRange(); } });

    document.querySelectorAll('.search-summary [data-field="dates"], .stay-modify [data-field="dates"]')
      .forEach(function (el) { wireTrigger(el, 'dates'); });
    document.querySelectorAll('.search-summary [data-field="passengers"], .stay-modify [data-field="passengers"]')
      .forEach(function (el) { wireTrigger(el, 'guests'); });

    // mobile compact summary (top bar) — tap to edit
    var cd = document.querySelector('.search-summary__compact .search-summary__cdates');
    var cp = document.querySelector('.search-summary__compact .search-summary__cpax');
    var ce = document.querySelector('.search-summary__compact .search-summary__cedit');
    if (cd) wireTrigger(cd, 'dates');
    if (cp) wireTrigger(cp, 'guests');
    if (ce) wireTrigger(ce, 'dates');

    document.addEventListener('click', function () { if (wrap && !wrap.hidden) closePop(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
    window.addEventListener('resize', function () { if (wrap && !wrap.hidden) position(); });
    window.addEventListener('scroll', function () { if (wrap && !wrap.hidden && !isMobile()) position(); }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
