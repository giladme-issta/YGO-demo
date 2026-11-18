# Eight-hotel YGO POC

## Agreed scope

- Node.js 24, separate HTML/CSS/JavaScript, no framework or database.
- Preserve the actual `issta-modules/hotel-page/index.html` desktop/mobile design.
- Only ProductIDs `14640478`, `22362808`, `17690826`, `4046285`,
  `6895127`, `4645325`, `11165062`, and `4458386` are accessible.
- An eight-hotel selector and `?hotel=<ProductID>` links select the hotel.
- Prefer nonempty `he-IL` data, then `en-US`; never select German before English.
  A hotel's official name may remain English even in its Hebrew field.
- Prices, offers, flight upsell, dates and booking terms remain clearly labeled
  mock commercial data. No checkout, reservation or payment request is made.
- Hotel content is real YGO data. No fabricated reviews, review counts, badges,
  attraction coordinates or recommendations outside the allowlist.
- Keep missing-content states in Hebrew and preserve the section's structure.
- Show an actual hotel-location map and the supplied nearby-place distances.
  The API does not supply POI coordinates: do not plot invented attraction pins.
  The Mapbox upgrade uses separate, labeled Search Box places for real green
  markers; the location section retains the original YGO places and distances.

## Research and verified integration

The local quick-start, Q&A notes, example response and actual mock were inspected.
The public YGO v2 selector, v1 authentication/sendMessage and guest-rating schemas
were verified against the documentation on 2026-11-17.

All eight hotels were successfully fetched through
`POST /v2/project/content/getEnrichedHotel`, using exactly:

```json
{ "ExternalHotelID": { "productid": "4458386" } }
```

Responses are held in ignored `.cache/hotels/<ProductID>.json`, not in the public
directory. The existing example response remains unchanged.

Direct Node connections fail in this environment; the configured Windows proxy
works with default proxy credentials. Provide an explicit Windows-proxy transport
as well as portable native fetch. Never disable TLS validation. Pass secrets only
through the server environment, never browser assets, logs or source files.

### AI integration: verified alternative

The initial `/v1/me` checks returned 401, but follow-up testing corrected the
inference about chat access: direct `POST /v1/sendMessage` with Bearer
authentication reaches project validation and returns HTTP 400:
`Bad Request - Peakwork provider not configured for this project`.
No-auth and `X-API-Key`-only requests return 401. YGO must enable/configure
`hotelinfo` for this project or clarify its current dependency on Peakwork.

The v1 index omits `createChat`, but a later live check confirmed
`POST /v1/createChat` works with Bearer authentication, a stable `X-User-ID`, and
body `{UserID, Locale:"en"}`. It returns HTTP 200 and the chat ID in `Data.ID`.
An actual create-then-send flow with matching user context and ProductID
`4458386` still fails on the same Peakwork prerequisite; chat bootstrap is now
verified, not an unresolved blocker. See the complete-flow trace and controlled
test matrix in `VALIDATION.md`.

The current gate also rejects missing chat/product fields and an invalid model
with the same provider error, so request-field changes do not bypass it.
Official v1 Q&A remains blocked on YGO project setup; the working preview
integration below is not presented as v1.

The user subsequently supplied a working request for the YGO-hosted preview
service `POST https://ygo-sales-demo.preview.ygo.ai/api/ask`. Its contract was
verified live: Basic authentication, a `messages` array, NDJSON `{t:"chunk"}`
events and final `{done:true,truncated:false}`. The Windows proxy needs
challenge-based Basic credentials rather than only an Authorization header.
The backend constructs grounding from the selected hotel's real content and
requests a Hebrew answer with source attribution. One such answer was verified
through the actual Node integration. No separate LLM account is used.

Use deterministic answers for supported factual questions, then this YGO
service for free-text questions. Without `YGO_DEMO_AUTH`, free-text AI remains
explicitly unavailable; there is no simulated answer. This preview endpoint
is a POC integration, not a confirmed production contract.

## Data mapping

| Page content | YGO source / treatment |
| --- | --- |
| Name, city, stars | `Names`, `Location.Address.CityNames`, `Stars` |
| Gallery | `Images`: URL, localized description, category; deduplicate URLs |
| About | `GeneratedTexts[locale].Summary.Text` |
| Advantages | `GeneratedTexts[locale].Highlights.Text`, safe Markdown bullets |
| Facilities | True boolean `FactualAttributes`; localized Name, ParentKey, IsFree |
| Location | `Location` coordinates/address and generated Location text |
| Nearby places | `POIs`; validate and normalize m/km, preserve unknown distance |
| Rooms | Localized Name/Description, SizeSqm, bed alternatives, facts and images |
| Policies | CheckIn, CheckOut, GuestPolicies, Policies, HouseRules, factual pet/parking data |
| Experiences | Dining text and actual leisure/wellness facilities; no invented claims |
| Ratings | `GuestRating`, scale 0-100 to 0-10; no invented missing scores |
| Review copy | Localized Summary/Pros/Cons; label as AI-generated YGO summary, not quotations |
| Suggestions | Other allowed hotels, not a claim of personalized recommendations |

Generated text is rendered as text/safe formatting, never trusted raw HTML.
Only consumed fields are sent to the browser: no vision detections, raw
compliance objects, timestamps per image, supplier IDs or unused locales.

## Internal contract

`GET /api/hotels` returns:

```text
{ hotels: [{id, name, city, stars, image, score, available, error?}],
  source: {mode}, ai: {available:boolean, reason} }
```

`GET /api/hotels/:id` returns:

```text
{ hotel: {
    id, name, city, stars,
    location: {latitude, longitude, address, city, countryCode},
    summary, locationText, highlights:[{title,text}],
    facilities:[{key,name,group,isFree}],
    pois:[{id,name,type,distanceMeters,inArea}],
    images:[{id,url,alt,category}],
    rooms:[{id,name,description,sizeSqm,beddings:[[string]],facilities,images}],
    policies:{checkIn,checkOut,guestPolicies,policies,houseRules,dining},
    rating:{score,subScores:{},summary,pros:[],cons:[]} | null
  },
  source:{mode,fetchedAt}, ai:{available:boolean,reason} }
```

Strings without data are empty, unknown numbers are null, and lists are empty.
`id` is always the external ProductID. Validate the upstream identity before
returning a hotel. `image` in a menu summary is a URL or an empty string.

`POST /api/hotels/:id/ask`, body `{question,messages?}`, returns:

```text
{answer, source:"hotel-data"|"guest-reviews"|"ygo-ai", quickReplies:[]}
```

Supported factual intents include beach distance, check-in/out, Wi-Fi, parking,
pets and review summaries. Distances come only from validated POIs, not generated
prose. Do not answer airport distance with beach distance, infer "no" from an
absent attribute, or treat missing/invalid units as meters. Unsupported free-text
questions use the verified YGO preview endpoint when configured, or return HTTP
503 `AI_UNAVAILABLE`; UI explains the actual limitation. Optional history has
at most six user/assistant messages and is cleared on hotel changes. Hotel
grounding is constructed on the server and excludes mock commercial prices.
Malformed input uses HTTP 400. Errors use `{error:{code,message}}`, with safe
Hebrew user-facing messages and no credential-bearing upstream dumps.

## Implementation boundaries

1. **Data module**: `server/hotel-data.mjs`, `server/qa.mjs`,
   `tests/hotel-data.test.mjs`, `tests/qa.test.mjs`.
   Export `HOTEL_IDS`, `mapHotel(raw, expectedId)`, `summarizeHotel(mapped)`,
   and `answerQuestion(raw, mapped, question)` (null for unsupported intent).
2. **Backend/integration**: HTTP server, repository/cache, native and Windows
   transports, sync CLI, setup documentation and route/transport tests.
3. **Frontend**: owns `public/` only. Vendor the required hotel-page,
   room-selection and shared assets, retaining original order and breakpoints.
   Bind the internal contract, not raw YGO responses. Do not modify the source
   mock. Replace mock hotel identity/data everywhere, including dialogs/sticky
   content. Keep mock prices and room offers visibly marked as demonstration.
   Repair inert navigation, stale galleries and hotel-switch races introduced
   by integration. Do not leave a simulated chat handler active.

## Persistence and modes

- `snapshot` (default): serve explicitly labeled saved YGO responses from the
  ignored cache. Never silently substitute the one-hotel sample.
- `live`: fetch YGO with bounded timeouts, caching/coalescing and bounded handling
  of 429 Retry-After. Upstream failures stay visible.
- `sample`: explicitly selected development mode; only the actual sample hotel's
  content is available, never cloned into the other seven IDs.
- A sync command refreshes only the eight approved IDs.
- Serve only `public/`, not the repository, snapshots, docs or credentials.
- Bind to loopback by default; no booking endpoints exist.

## Acceptance checks

- Unit tests for Hebrew precedence/fallback, room mapping, string boolean facts,
  rating scales, malformed distances, identity mismatch, missing data and Q&A.
- HTTP tests for all eight IDs, forbidden IDs, malformed/body-limited questions,
  upstream failures, snapshot/sample behavior and restricted static paths.
- Syntax-check custom JavaScript and run Node's built-in test runner.
- Browser-check desktop and mobile widths against the original mock: layout,
  overflow, image loading, all eight selections, deep links/back navigation,
  gallery/category/lightbox, facilities, map, room dialogs, Q&A, loading/errors.
- Explicitly test that no commercial interaction performs a real reservation.
- Document verified results and the preview-service dependency honestly.
