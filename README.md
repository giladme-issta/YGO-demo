# YGO hotel details POC

Hebrew-first hotel content for **eight hotels only**, using the actual Issta
desktop/mobile mock. Node.js 24+, HTML, CSS and JavaScript; no install or build
step is required.

## Run

```powershell
npm start
```

Open <http://127.0.0.1:3000/>. Select a hotel or use a direct URL:
<http://127.0.0.1:3000/?hotel=4458386>.

The default is **snapshot mode**: real YGO responses previously downloaded into
the ignored `.cache/hotels/` directory. All eight were fetched for this working
copy. They are not committed; a fresh clone must sync first. Missing snapshots
produce an explicit setup error, never content copied from a different hotel.

Allowed ProductIDs: `14640478`, `22362808`, `17690826`, `4046285`,
`6895127`, `4645325`, `11165062`, `4458386`.

## Private POC access

The server uses the browser's native **HTTP Basic username/password prompt**,
not a client-side alert that can be bypassed.

- Local development/testing on `127.0.0.1`, `localhost` or `::1` needs no login.
- Production/staging, a non-loopback `HOST`, or a non-local `PUBLIC_ORIGIN`
  requires `POC_AUTH_USER` and `POC_AUTH_PASSWORD`. The password must have at
  least 12 characters; use a password manager to generate a longer random one.
- Missing/invalid credentials stop the server **before it listens**. There is
  no default shared password and no request-header-based authentication bypass.
- HTML, assets, hotel APIs, Mapbox configuration and Q&A are protected. Only
  `GET /api/health` is public; on a protected deployment it returns only
  `{"status":"ok"}` for hosting health checks.
- These are the POC's viewer credentials, **not** the YGO API credentials.
  Keep them in the hosting dashboard's environment settings, not Git or
  client-side code. Share the password with the project manager separately.

Hosted Basic Auth requires **HTTPS**. Use `NODE_ENV=production` when sharing a
local server through a public tunnel too; a development server bound to
loopback cannot infer that an external proxy is exposing it.

To try the prompt locally without storing the password in shell history:

```powershell
$credential = Get-Credential -UserName 'poc' -Message 'Shared POC login'
$env:POC_AUTH_USER = $credential.UserName
$env:POC_AUTH_PASSWORD = $credential.GetNetworkCredential().Password
$env:NODE_ENV = 'production'
npm start
```

For HTTPS reverse proxies, set `PUBLIC_ORIGIN` to the exact public origin,
such as `https://your-poc.example.com` (no path). This keeps Q&A's same-origin
validation working behind TLS termination. On Render, the app automatically
uses `RENDER_EXTERNAL_URL` unless `PUBLIC_ORIGIN` overrides it.

## Deploy a project-manager preview

**Recommended: a [Render Web Service](https://render.com/docs/web-services)**,
not a static site. The Node server is required for YGO content, Q&A and the
password gate; GitHub Pages alone cannot run it.

1. Push the application source to your repository, excluding `.env`, secrets
   and `.cache/`.
2. Connect that repository to a new Render **Web Service**, with Node runtime.
3. Use **Build Command:** `npm run check`; **Start Command:** `npm start`.
   This app has no package dependencies to install.
4. Configure the following environment variables in Render:

   | Variable | Value |
   | --- | --- |
   | `NODE_VERSION` | `24` |
   | `NODE_ENV` | `production` |
   | `HOST` | `0.0.0.0` |
   | `POC_AUTH_USER` | Your chosen shared username |
   | `POC_AUTH_PASSWORD` | A strong, randomly generated shared password |
   | `MAPBOX_PUBLIC_TOKEN` | The working public Mapbox token |
   | `YGO_DATA_MODE` | `live` |
   | `YGO_PROJECT_KEY` | Your YGO content API key |
   | `YGO_PROJECT_ID` | Your YGO project ID, if different from the configured default |
   | `YGO_DEMO_AUTH` | Optional: YGO preview Q&A credential for free-text AI |
   | `PUBLIC_ORIGIN` | Only needed to override the automatic Render URL, e.g. a custom HTTPS domain |

   Leave `PORT` to Render and leave `YGO_TRANSPORT` unset (native HTTPS).
   Do not copy the Windows-only `windows-proxy` setting to a Linux host.
5. Set the health-check path to `/api/health`. Render redirects public HTTP to
   HTTPS and terminates TLS before forwarding requests to Node.
6. If the Mapbox token is URL-restricted, allow the new preview origin. After
   deployment, verify the login prompt, hotel content, map and Q&A before
   sharing the HTTPS link and login details.

**Content matters:** `.cache/hotels/` is local and ignored by Git. A fresh
deployment in snapshot mode has no hotel content unless you separately provision
those files. `live` mode avoids that dependency and caches fetched content in
memory for five minutes. Alternatively, `sample` mode uses the included response
but supports **only hotel `4458386`**.

Render's [free web services](https://render.com/docs/free) sleep after 15 minutes
without inbound traffic and have ephemeral storage. For a predictable scheduled
demo, use a paid instance or open the link ahead of time. This setup has been
documented but no cloud resources have been created or deployed.

## Refresh YGO content

Configure credentials in the server process environment. Do not commit them,
put them in public JavaScript, or paste them into logs.

```powershell
$credential = Get-Credential -Message 'YGO project key: put the key in the password field'
$env:YGO_PROJECT_KEY = $credential.GetNetworkCredential().Password
$env:YGO_PROJECT_ID = '01a1ac5e-3596-7f4c-bf1c-5917f5035f3b'

# Required on the authenticated Windows proxy used for this POC.
# Omit this on machines where native Node fetch works.
$env:YGO_TRANSPORT = 'windows-proxy'
npm run sync
npm start
```

Sync fetches only the eight approved hotels, validates their identities, and
atomically replaces each successful snapshot. A failed hotel is reported and
its old file is not overwritten. Restart the snapshot server after syncing.

Other modes:

| Command | Behavior |
| --- | --- |
| `npm run start:live` | Query YGO through the server; cache each hotel for five minutes |
| `npm run start:sample` | Explicit sample mode; only hotel `4458386` has content |

`HOST` defaults to `127.0.0.1`, `PORT` to `3000`. `YGO_DATA_MODE` can also select
`snapshot`, `live`, or `sample`. Native HTTPS is the default transport; the
Windows-proxy transport preserves certificate validation and uses the configured
system proxy with the current Windows proxy credentials.

Windows PowerShell can misdecode JSON without a charset as Latin-1. The proxy
adapter deliberately decodes raw response bytes as UTF-8, including streamed AI
text, so Hebrew remains intact.

## Hotel Q&A

Supported factual questions are answered directly from YGO data: beach distance,
check-in/out, Wi-Fi, parking, pet policy and guest-review summaries. Missing facts
are not interpreted as "no"; invalid distance units are not interpreted as meters.

Free-text questions use **YGO's own preview Q&A service**, supplied and verified
for this POC. No independent LLM subscription is needed. Configure its separate
Basic credentials in the same terminal before starting:

```powershell
$qaCredential = Get-Credential -Message 'YGO demo Q&A login'
$pair = '{0}:{1}' -f $qaCredential.UserName, $qaCredential.GetNetworkCredential().Password
$env:YGO_DEMO_AUTH = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$pair = $null
$env:YGO_TRANSPORT = 'windows-proxy'
npm start
```

The server sends the question, bounded conversation history, and selected-hotel
content to `https://ygo-sales-demo.preview.ygo.ai/api/ask`. It does **not** send
mock prices, browser cookies, image-analysis payloads or unrelated hotel data.
Answers request Hebrew and source attribution. Truncated or malformed streams,
authentication failures and provider errors are reported rather than replaced
with pretend answers.

Without preview-service credentials, factual Q&A still works and unsupported
questions show an explicit AI-unavailable message. The preview service uses a
different credential from the content project key and remains a POC dependency.

### Official v1 Q&A: verified blocker

The supplied [sendMessage specification](send-message.md) describes the intended
official integration: `Model: "hotelinfo"`, a valid created `ChatID`, a stable
`UserID`, and the selected numeric hotel ID in `StructuredInput.ProductID`.
Read the assistant answer from `Data.Messages` and suggestions from
`Data.QuickReplies`; the example IDs are placeholders, not usable chat IDs.

A direct `POST /v1/sendMessage` test with the current project key as
`Authorization: Bearer ...` reached project validation and returned:

```json
{"Data":null,"Error":"Bad Request - Peakwork provider not configured for this project"}
```

This is HTTP **400**, not an authentication failure. Requests without Bearer
authentication, including `X-API-Key` alone, returned 401. The earlier `/v1/me`
test was therefore insufficient to determine `sendMessage` access.

Further live investigation verified the missing bootstrap:

1. `POST https://api.ygo.ai/v1/createChat` with Bearer authentication,
   `X-User-ID` set to a stable user ID, and a JSON body containing that same
   `UserID` and `Locale: "en"` returns HTTP 200 with the real chat ID in `Data.ID`.
   Its successful `Error` field is an empty string, not necessarily null.
2. Pass this actual ID as `ChatID` to `sendMessage`, keeping the same `UserID`
   and header. This full flow was tested with hotel ProductID `4458386`.
3. `sendMessage` still returns the Peakwork configuration error above.
   The complete-flow failure has `X-Trace-ID`:
   `9c8077575c8d3a7b39015ce06984be98`.

Thus chat creation is no longer an unknown prerequisite. YGO must
enable/configure the project for `hotelinfo`, or clarify whether this model can
use enriched content without a Peakwork provider. That check currently blocks
requests before model/chat/product validation; English, Hebrew, `hotelreviews`,
and a second allowed hotel all hit the same error. Actual v1 answer generation,
Hebrew response support and hotel resolution still cannot be verified past this
gate. The POC does not claim a completed v1 integration; its verified preview
AI remains unchanged. See the [audit evidence](VALIDATION.md#official-v1-access-audit).

## Mapbox map

Create a local `.env` in the repository root with `MAPBOX_PUBLIC_TOKEN` set to a
**public** Mapbox token (`pk.`):

```dotenv
MAPBOX_PUBLIC_TOKEN=<your public Mapbox token>
```

`npm start`, `npm run start:live` and `npm run start:sample` load `.env`
automatically using Node's native environment-file support. An existing process
environment value takes precedence. Restart the server after changing the token.
`.env` is ignored by Git; no token is hardcoded in source. Secret tokens (`sk.`)
are never sent to the browser. If your organization prevents tooling from
creating `.env`, create it yourself or set the variable in the terminal before
starting the server.

For URL-restricted tokens, allow the POC origin (including localhost during
development). The browser receives the public token from `/api/map-config`;
Mapbox GL JS and Search Box requests go directly to Mapbox.

The map loads on first open, using Mapbox Streets with the mock's orange hotel
pin, green place pins, tooltips, distance filters, zoom controls and responsive
sidebar/mobile carousel. The basemap is real cartography, not the mock SVG.
Missing configuration, network/WebGL errors and unavailable search results are
shown explicitly.

Hotel coordinates come from YGO. Since YGO POIs have no coordinates, the map's
nearby places come from Mapbox Search Box (attractions, beaches, restaurants and
airports, up to 50 km away). This is a separate list from the YGO places in the
location section. Map distances are calculated in a straight line, **not**
walking/driving routes or travel times. Search results use English (Hebrew is not
supported by Search Box) and remain in page memory only. Map opens and category
searches incur Mapbox API usage; closing/reopening the same hotel reuses its map.
The replacement public token was verified with live Mapbox tiles and Search Box.
Missing configuration, old server versions, CDN failures and Mapbox access
errors produce distinct messages rather than the same generic setup error.

## Real content versus demo content

- **Real YGO content:** hotel/room names, photos, descriptions, amenities,
  policies, POIs, aggregated ratings and AI-generated review summaries.
- **Language:** nonempty Hebrew first, English fallback. Official names may be
  English even when supplied under `he-IL`.
- **Demo only:** prices, rate offers, dates/guest search, flights, taxes and
  commercial conditions inherited from the mock. No booking/payment endpoint
  exists; controls must not create reservations.
- **Reviews:** summaries and pros/cons, not invented individual reviewers,
  review counts or quotations.
- **Map:** Mapbox at the actual hotel's YGO coordinates. Green markers and the
  map's place list are Mapbox search results, not invented YGO POI coordinates.
- **Rooms:** names, photos, descriptions, size, beds and facilities are YGO
  content (including YGO-generated descriptions). Prices, meal plans, rate
  offers and cancellation/commercial terms remain mock data. Snapshot mode
  uses saved YGO responses, not a fresh availability/pricing call.
- **Suggestions:** only the other allowed hotels, not personalized rankings.
  Hotel identity, photos, stars and ratings are real; the original mock's
  stay/date/guest rows and green price buttons are decorative demo offers.

### Exactly what is static/demo

| Displayed data | Source / limitation |
| --- | --- |
| Hotel-only/package prices in the title and sticky bar | Fixed `$2,128`; not calculated from dates or supplier rates |
| Flight banner and its price | Mock flight offer and fixed `$2,107`; no flight search or inventory |
| Suggested-hotel prices, dates and guests | Original Issta mock footer templates, including the green "order now" button; clicking opens the selected hotel's details, not checkout |
| Room offers | The same three template offers for every YGO room: `$950`, `$980`, `$999` |
| Bookit/member prices | Fixed `$900`, `$930`, `$950`; no real membership lookup or discount calculation |
| Offer meal plans | Mock room-only / half-board offers, not bookable meal plans returned by YGO |
| Cancellation and payment terms | Mock refundable/non-refundable flags, cancellation deadline, pay-later text/date and "new" badge |
| Tax/VAT details | Mock "VAT included", tax amounts (`€103.09`, `EUR 50.09`) and booking/tax terms |
| "Cheapest" and promotional labels | Template claims, not a comparison against supplier offers |
| Dates, nights and guest/room selection | Local demo controls/defaults; they do not fetch availability, match room occupancy or recalculate prices |
| Booking, payment and Bookit actions | Demo notices/navigation only; no login, reservation or payment is performed |
| Small map preview, icons, logos and decorative art | Mock UI assets; the opened map is real Mapbox cartography |

Hotel and room names, photos, generated descriptions, room size, bed options,
facilities, hotel address/coordinates, check-in/out/general policies, YGO nearby
places/distances and rating/review summaries are **YGO content**, not invented
template values. They currently come from saved API snapshots, not live room
availability. General hotel policies are separate from the mock offer's
cancellation/payment terms. The full map's places come from **Mapbox**, not YGO.

The basis filter operates on the mock offer metadata: selected meal plans are
combined with **OR**, and free cancellation is combined with **AND**. It hides
nonmatching offers and rooms with no matching offers, without changing real
room descriptions. The existing template has no breakfast-only offer, so that
filter alone shows an explicit demo-empty state with a clear-filter button.
Filters remain applied when another hotel is selected.

### Gallery categories and presentation

The responses used by this POC include `Images[].Category`. The server's
`mapImages` copies that value to `images[].category`; the browser's `categoryKey`
normalizes known values and supplies Hebrew tab labels (for example,
`restaurant` becomes the food/drink tab and `pool` becomes the pool tab).
Missing or unsupported values go to "Other". This is not frontend image
recognition, an extra AI call, or a classification inferred from image captions.
If a different YGO response omits the field, it cannot populate the same tabs
without additional metadata.

Experience cards show up to four lines initially, with a keyboard-accessible
more/less control for the full source text. Markdown heading markers are removed
from the preview. A matching hotel image is preferred; a general hotel image is
explicitly labeled when no matching category photo exists. Cards never borrow
photos from another hotel. Duplicate dining groups are omitted and the grid is
limited to six cards, matching the mock's two-row design.

The original SVG assets are copied unchanged from `issta-modules`. Dynamic
facility, hotel-policy and review icons reuse the original inline SVG templates,
rather than checkmark text. Templates are captured before hotel loading clears
the original rows, so switching hotels does not lose their icons. Where the mock
has no matching icon, the POC supplies small line SVGs for balconies/outdoor
spaces, guest conditions, hotel policies and house rules; unrecognized facility
groups use a general information icon. Existing service and bed icons are reused
for those categories. "Order now" labels retain the POC's non-booking behavior
and demo disclosures.

Remote hotel photos, Google Fonts and Mapbox require network access.
Server-side snapshots do not make these third-party assets available offline.
The app serves only `public/`; source docs, cache files and credentials are not
web-accessible.

## Development and validation

```powershell
npm test
npm run check
```

Tests use Node's built-in runner and cover mappings, localization, Q&A, streaming
responses, upstream errors/retries, hotel allowlisting, cache modes and HTTP
validation/static-file confinement.

- `server/`: HTTP/API, mapping, factual Q&A and YGO adapters.
- `public/`: copied mock layout/assets and data-bound browser components.
- `scripts/`: eight-hotel sync, syntax checks and Windows proxy transport.
- `tests/`: focused regression tests.
- [Implementation plan](IMPLEMENTATION-PLAN.md): approved scope, mappings,
  research findings and API contract.
- [Validation results](VALIDATION.md): automated, live-API and desktop/mobile checks.

The original sibling `issta-modules` mock is unchanged. The vendored design is
used as the visual baseline; only content bindings, necessary interaction fixes,
clear demo labels and missing-data states are added.

