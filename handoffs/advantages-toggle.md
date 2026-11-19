**Goal:** Implement advantages as bullets with one shared expand/collapse toggle for details.
**Done:** public/hotel-page/index.html — verified nine plain-text items and no existing detail text.
**Next:** Inspect test commands, then update markup/CSS/JS: show all nine sentences as bullets, remove check icons and the mobile three-item collapse, and keep one bottom toggle hidden until non-empty `.advantages__detail` content exists; the toggle must reveal or hide all details and switch Hebrew labels.
**Files:** public/hotel-page/index.html, public/hotel-page/advantages/advantages.css, public/hotel-page/advantages/advantages.js
**Decisions:** Keep all bullets visible | Hide the shared toggle until detail text exists | Preserve the responsive grid
**Constraints:** Preserve unrelated dirty changes in index.html; follow About Hotel aria-expanded and label behavior; do not add placeholder details or a visible no-op toggle.
**Memory:** RECORD owed: yes
