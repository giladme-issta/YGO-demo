**Goal:** Render advantages as bullets and add one shared toggle for populated details.
**Done:** package.json — confirmed `npm test` and `npm run check` validation commands.
**Next:** Inspect and update `renderHighlights` so API-rendered titles remain bullets and nonempty descriptions become `.advantages__detail` entries controlled by the shared toggle.
**Files:** public/hotel-page/index.html, public/hotel-page/advantages/advantages.css, public/hotel-page/advantages/advantages.js, public/hotel-page/hotel-app.js, tests/
**Decisions:** Keep every bullet visible | Show the toggle only when details exist | Preserve the responsive grid
**Constraints:** Preserve unrelated dirty changes in index.html; no placeholder details; inspect project instructions; run focused tests and syntax check.
**Memory:** RECORD owed: yes
