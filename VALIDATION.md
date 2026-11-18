# POC validation

Validated on 2026-11-17 with Node.js 24 and the VS Code integrated Chromium browser.

## Automated checks

- `npm test`: **40 passed, 0 failed, 0 skipped**.
- `npm run check`: **39 JavaScript files checked, 0 syntax failures**.
- `git diff --check`: passed.
- No real project keys or Basic authorization values found in the added
  application, scripts, tests or documentation.

Tests cover Hebrew precedence, room localization, false/scoped facilities,
rating scales, distance units, hotel identity, snapshot/live/sample behavior,
request validation, upstream errors and rate limits, bounded chat history,
grounding and complete NDJSON answers.

## Live content

All eight approved ProductIDs were fetched from YGO, persisted in the ignored
snapshot cache, served through the local API and selected through both desktop
and mobile controls. Every hotel's mapped summary contains Hebrew.

| ProductID | Rooms | Hotel images |
| --- | ---: | ---: |
| 14640478 | 10 | 176 |
| 22362808 | 12 | 188 |
| 17690826 | 10 | 176 |
| 4046285 | 9 | 214 |
| 6895127 | 18 | 226 |
| 4645325 | 17 | 196 |
| 11165062 | 12 | 186 |
| 4458386 | 13 | 246 |

Mapped detail responses were approximately 97-150 KB. The browser does not
receive raw multilingual enrichment or image-analysis payloads.

## Browser checks

- Original mock and POC visually compared at desktop and mobile sizes.
- At 1440px, original and POC shared the measured header/search/gallery/chat
  heights: **74 / 82 / 445 / 224 px**. Text wrapping varies with real hotel data.
- Horizontal document overflow: **0px** at widths **320, 375, 390, 768, 1024,
  1440** after fixing inherited narrow-screen overflow.
- All eight desktop selections and all eight mobile selections loaded the
  correct hotel; the mobile menu closed after selection.
- Browser Back restored the previous hotel. Switching while a lightbox was
  open closed the old hotel's gallery and restored page scrolling.
- Category filtering, full-screen gallery, Escape/focus restoration, facilities
  dialog, room details and room-photo gallery passed.
- Bathroom and conference images were checked in their correct categories;
  facility group labels and About text no longer expose raw keys/Markdown.
- The original map used actual hotel coordinates with an OpenStreetMap embed;
  it has now been replaced by the Mapbox integration described below.
- Rooms/reviews navigation scrolled to the intended sections.
- A demo order click showed its explanatory notice and made **zero booking
  POST requests**. Unimplemented header destinations stayed in the POC with
  an explicit notice rather than navigating to a 404.
- Invalid hotel URLs retained their ID and showed a Hebrew error, not another
  hotel's data. Missing photos did not leave fake counters or gallery controls.
- No broken completed images were observed on the checked loaded pages.

## Mapbox upgrade checks

- `node --test --test-reporter=dot tests/app.test.mjs tests/mapbox-map.test.mjs`:
  **8 passing tests**, including public-token configuration, secret-token
  rejection, coordinate validation and straight-line distance grouping.
- `npm run check`: **43 JavaScript files, 0 syntax failures**.
- The disclaimer matches the requested short Hebrew text exactly.
- Browser interaction checks used the real Mapbox GL JS renderer with
  **explicitly mocked style and Search Box responses**, not live map data.
  At desktop size, filters synchronized visible cards and pins, keyboard
  focus selected the corresponding pin, zoom moved markers, Escape restored
  focus, and reopening did not duplicate the map or markers.
- At **390 x 844**, the full-screen map had **0px document overflow**, a
  horizontal card carousel, working distance filters, and carousel scrolling
  selected the matching marker. Switching hotels removed the previous markers
  and updated the hotel marker/name. Custom markers retain button semantics.
- The original public token returned 200
  for the style JSON, sprite and font resources, but **403 Forbidden** for
  the vector tileset and Search Box category/list endpoints. The UI reports
  these failures instead of substituting fake locations.
- **Replacement-token live verification passed:** token validation, vector
  tiles and Search Box category discovery all returned 200. NYX Limassol
  rendered the real basemap, one orange hotel marker and **30 real green
  place markers / cards**. Selecting the short-drive group showed **9 cards
  and 9 pins**. No fixtures were used for this check.
- Runtime setup uses `MAPBOX_PUBLIC_TOKEN`; no token was embedded in source.
  Start scripts now load `.env` automatically. The organization policy blocked
  creating that file through the assistant; the running server was started with
  the replacement key in its process environment instead.

## Sticky price and demo basis filter checks

- Sticky price labels, amounts, notes and buttons fit inside the bar at
  **1440, 1024 and 769px**; no horizontal document overflow was observed.
  The bar measured about **104px** wide-screen and **153px** near the desktop
  breakpoint. Navigation offsets use the actual bar height rather than 83px.
- At NYX Limassol, half-board filtering showed **10 offers across 10 rooms**.
  Breakfast-only showed **0 rooms and 1 explicit empty state**. Clearing restored
  **30 offers across 10 rooms** and cleared all selected chips.
- At **390px**, room-only showed **20 offers**; adding free cancellation
  narrowed this to **10**. Document overflow remained **0px**.
- Focused room-filter tests cover meal-plan OR / cancellation AND behavior,
  divider visibility, empty/reset behavior and missing YGO room content.
  A sticky-navigation test covers changing desktop heights and mobile offsets.

## Content-card and SVG parity checks

- NYX Limassol's long dining preview now measures **90px** at a **22.475px**
  line height (four lines, allowing integer rounding), rather than extending
  the whole grid. Expanding reveals **539px** of source text; collapsing
  restores **90px**. Raw Markdown heading markers are not displayed.
- All four rendered NYX experience cards have loaded hotel images. The first
  row's cards measured about **408px** high; suggestions retain the original
  mock's **511px** card height, date/guest rows and green two-line price CTAs.
- At an explicitly verified **390px** emulated viewport, experience cards use
  one **358px** column, the longest preview is **87px** (four 21.7px lines),
  and horizontal document overflow is **0px**.
- A suggestion "order now" click selected hotel `14640478` and sent **zero
  same-origin POST requests**. Room buttons display the requested label without
  enabling booking.
- All standalone SVGs compared under the copied hotel-page, room-selection and
  shared directories matched their source files byte-for-byte, with none
  missing. Facility, policy and review SVG substitutions were replaced with
  clones of the original inline templates; five source facility SVGs and nine
  POC template mappings were verified.
- Raw NYX data contains `Images[].Category` on its 176 images, including 32
  `restaurant` images. Selecting the gallery's food/drink tab displayed exactly
  **32 photos**. The sample response also contains image categories.
- The existing 12 focused map/sticky/room-filter tests and syntax checks for
  **43 JavaScript files** pass; the updated page loaded without JavaScript errors.

## Missing-icon regression checks

- Fixed policy/review templates being captured too late: `clearHotelData`
  removed the original rows before their lazy icon lookup ran.
- `node --test tests/hotel-icons.test.mjs`: **3 passing regressions** covering
  original icons across initial clearing and hotel switches, semantic policy
  SVGs, and facility-category fallbacks.
- Browser checks switched through **all eight hotels** and returned to NYX:
  **0 missing SVGs** across facility-category, hotel-policy and review rows.
- Existing policy icons and new supplemental icons render at **28 x 28px**
  with nonempty geometry and the existing green `currentColor` styling.
- `npm run check`: **44 JavaScript files, 0 syntax failures**.

## Hosted access checks

- `node --test tests/access-control.test.mjs tests/app.test.mjs`:
  **11 passing tests**. Coverage includes local bypass, production/public-bind
  fail-closed configuration, invalid/Unicode credentials, protected pages and
  APIs, spoofed localhost headers, and the minimal public health endpoint.
- The production entrypoint exits with `POC_AUTH_CONFIG` before listening if
  the username/password are missing.
- A smoke check against real POC HTML, JavaScript and sample hotel data returned
  **401 without credentials / 200 with credentials** for all three resources.
  The response challenge uses the browser-native Basic Auth mechanism.
- Authenticated Q&A accepted the configured HTTPS origin and returned a real
  `hotel-data` answer; a foreign origin returned **403**.
- `npm run check`: **46 JavaScript files, 0 syntax failures**.
- No production credentials were committed, and no cloud deployment was made.
  Hosting setup and required YGO/Mapbox environment variables are in README.

## Q&A checks

- Actual factual HTTP answer: the structured beach POI for hotel 6895127
  produced the supplied 50-meter distance.
- Real YGO preview-service requests returned Hebrew, hotel-grounded answers
  with source attribution, through both the Node integration and mobile UI.
- Delayed-response browser regression: closing chat and clicking another chip
  sent only one request; the original answer remained and its pending indicator
  disappeared.
- A controlled 3,001-character answer stayed fully visible while outgoing
  conversation history was capped at 2,000 characters per message.
- Temporary browser response stubs used for these edge cases were removed;
  the final page uses the real backend.

## Official v1 access audit

Follow-up live checks on 2026-11-17 distinguished the credentials in the supplied
onboarding emails: a project key for content API access and a separate Basic
login for the preview website. Neither credential was embedded in application
source or forwarded to an unrelated service.

| Check | Observed result |
| --- | --- |
| `listEnrichedHotelSummaries`, Bearer + project ID | HTTP 200, exactly eight hotels; external ProductIDs match the allowlist |
| Summary UUID passed to `getEnrichedHotel` | HTTP 200; expected ProductID `4458386`, 13 rooms and Hebrew content |
| `sendMessage`, no auth / X-API-Key only | HTTP 401 |
| `sendMessage`, deliberately invalid Bearer key | HTTP 401 |
| `sendMessage`, valid Bearer, with/without project header | HTTP 400, Peakwork provider not configured |
| `hotelinfo`, English / Hebrew, two allowed hotel IDs | Same provider error |
| `hotelreviews` | Same provider error |
| Missing ChatID / missing ProductID / invalid model controls | Same provider error, before those fields can be validated |
| `createChat`, Bearer + matching `X-User-ID` and body `UserID`, `Locale:"en"` | HTTP 200, real `Data.ID` returned |
| `sendMessage` using that real chat and the same user | HTTP 400, same provider error |
| Preview website login | HTTP 200 |
| Preview browser implementation | Inline client calls `/api/ask` with hotel grounding; no `sendMessage`, `createChat` or `hotelinfo` reference in the delivered client |
| Existing local preview-backed chat | HTTP 200, `source:"ygo-ai"`, real Hebrew answer |

The complete create-then-send failure returned:

```json
{"Data":null,"Error":"Bad Request - Peakwork provider not configured for this project"}
```

Vendor support correlation:

- Valid-chat `sendMessage`: `X-Trace-ID: 9c8077575c8d3a7b39015ce06984be98`
- Working v2 summaries: `X-Trace-ID: f80085773fd82f05057031227454b487`
- Working v2 full hotel by summary UUID: `X-Trace-ID: 4eba90d86ab86181497577cc3e8ada88`
- Hebrew `sendMessage` diagnostic: `X-Trace-ID: e74910ba0aef033b1429483fdab4ee52`

The published v1 index lists neither chat creation nor provider configuration.
That omission did not prove chat creation was unavailable: the explicitly
referenced operation was tested at its inferred RPC path and succeeded.
The documented `GET /v1/me` also returned 404 once user context was supplied;
its earlier 401 without that context was not a valid test of chat access.
Windows PowerShell preserves consumed HTTP error bodies in
`ErrorRecord.ErrorDetails.Message`; reading only the exception response stream
initially produced an empty body and hid the actionable provider error.

The current demonstrated blocker is project/provider setup, not credentials,
content access, missing hotel data, or inability to create a chat. YGO needs
to enable/configure `hotelinfo` for this project or explain its dependency on
Peakwork. No successful official-v1 answer is claimed; v1 Hebrew answers and
downstream ProductID resolution remain unverified behind that gate. No provider
settings or bookings were changed. The working POC still uses the preview API.

## Intentional limits

Prices, commercial conditions, flight offers and booking controls are demo-only.
AI depends on the preview service and valid server-side credentials. Remote
photos, fonts and maps require network access. Browser checks used emulated
viewport sizes, not physical devices or an exhaustive pixel-diff suite.
