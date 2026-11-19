**Goal:** Make the YGO `fac-modal` match the photo mosaic in the issta-modules mock.
**Done:** Confirmed the mock renders category `photos`; YGO currently clears the photo container without populating it.
**Next:** Implement category-matched photo mosaic rendering and focused tests.
**Files:** `public/hotel-page/hotel-app.js`, `tests/hotel-image-assignment.test.mjs`
**Decisions:** Use the selected hotel's categorized image data; do not copy static mock photos.
**Constraints:** Preserve pre-existing worktree edits. Open photo tiles in the shared lightbox.
**Memory:** RECORD owed: yes
