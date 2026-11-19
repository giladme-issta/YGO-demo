**Goal:** Keep the room details popup above the sticky price header without covering its photo lightbox.
**Done:** `public/room-selection/room-details-popup/room-details-popup.css` — confirmed popup z-index 990.
**Done:** `public/hotel-page/hotel-sticky/hotel-sticky.css` — confirmed sticky header z-index 1000.
**Done:** `public/shared/gallery-lightbox/gallery-lightbox.css` — confirmed shared lightbox z-index 1000; it opens from the room popup.
**Next:** Inspect focused tests, raise the room popup above 1000 and the lightbox above the popup, then run relevant validation.
**Files:** `public/room-selection/room-details-popup/room-details-popup.css`, `public/shared/gallery-lightbox/gallery-lightbox.css`, `tests/hotel-sticky.test.mjs`, `scripts/check-syntax.mjs`
**Decisions:** Keep the sticky header's z-index; raise popup to 1001 and lightbox to 1002.
**Constraints:** Preserve unrelated existing worktree changes. Task memory is on; RECORD is owed if the multi-file fix succeeds.
**Memory:** yes
