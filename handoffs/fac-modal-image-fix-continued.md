**Goal:** Implement the category-matched facility-photo mosaic with shared lightbox behavior and a focused test.
**Done:** Confirmed `categoryKey`, `normalizedImages`, `openLightbox`, and `.fac-photos` layout already exist.
**Next:** Render current-hotel images matching the facility group; show a five-tile mosaic with a `+N` overlay when needed, pass all matched photos to `openLightbox` on tile click, call from `renderFacilityDialog`, and test the rendered output plus `gallery-lightbox:open`.
**Files:** `public/hotel-page/hotel-app.js`, `tests/hotel-image-assignment.test.mjs`
**Decisions:** Match via `categoryKey`; source photos from selected hotel data; lightbox includes every category match, including tiles beyond the five-tile mosaic.
**Constraints:** Preserve all existing worktree edits, including edits in `hotel-app.js` and the untracked image-assignment test. Do not use static mock photos.
**Memory:** RECORD owed: yes
