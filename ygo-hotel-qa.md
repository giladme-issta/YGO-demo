# YGO Hotel Q&A — Integration Notes for Agent

## Goal
Hotel page UI component where the user asks a free-text question about a hotel (e.g. "How far is it from the beach?") and gets an answer.
**Constraint:** we have NO LLM of our own. Answers must come from YGO (or from deterministic logic over YGO data).

## TL;DR — Strategy
1. **Free-text questions** → YGO `sendMessage` (v1) with `Model: "hotelinfo"`. YGO's own AI answers.
2. **Beach distance (and other distance questions)** → deterministic answer from `getEnrichedHotel` (v2) `POIs`, because it is NOT confirmed that `hotelinfo` uses POI/distance data.
3. Route: if the question matches a known intent (beach / distance) → use POIs; otherwise → `hotelinfo`. Optionally: call `hotelinfo` first and fall back to POIs if the answer has no distance.

> ⚠️ `POST /v2/project/content/generateText` is NOT a Q&A endpoint. It's an async batch job that generates marketing texts (Summary, HouseRules…) per hotel. It has no prompt/question field. Do not use it for this feature.

---

## 1. Hotel Q&A — `sendMessage` (v1, Client API)

- **URL:** `POST https://api.ygo.ai/v1/sendMessage`
- **Headers:** `Authorization: Bearer <token>`, `X-User-ID: <user-id>`, `Content-Type: application/json`
- **Docs:** https://docs.ygo.ai/v1/send-message-to-ygo-ai-3955048e0 , https://docs.ygo.ai/v1/ai-search-trip-planning-355720m0

### Request
```json
{
  "ChatID": "<chat-id>",
  "Content": "How far is the hotel from the beach?",
  "UserID": "<user-id>",
  "Locale": "en",
  "Model": "hotelinfo",
  "StructuredInput": { "ProductID": "<hotel-product-id>" }
}
```
| Field | Notes |
|---|---|
| `ChatID` | Conversation id; reuse for follow-ups. May require creating a chat first (`createChat`) — **unverified**. |
| `Content` | The user's free-text question. |
| `Locale` | e.g. `en`, `he`? (Hebrew support **unverified**) |
| `Model` | `hotelinfo` = hotel Q&A. `hotelreviews` = review-based answers only. Both require `ProductID`. |
| `StructuredInput.ProductID` | **Required** for `hotelinfo`. Identifies the hotel. Mapping to our ids **unverified** (see Open Questions). |

### What `hotelinfo` does (per docs)
Answers questions about a specific hotel's amenities and policies (examples in docs: check-in time, spa). Uses official hotel details + selected guest reviews, and attributes each fact to hotel data vs. guest feedback.

### Response
Envelope: `{ "Data": { ... }, "Error": null }`.
Known `Data` fields (from generic example): `ID`, `ChatID`, `UserID`, `Content`, `Locale`, `Model`, `Messages[]` (`Role`, `Content`), `QuickReplies`, `Intents`, `Instructions`.
**The `hotelinfo` response body is NOT documented.** Assume the answer is in the last `Messages[]` item with `Role` = assistant — verify against sandbox and adjust.

### Docs gaps (verify in sandbox before relying)
- No real `hotelinfo` request/response example in docs.
- Unknown whether `hotelinfo` answers distance questions (POIs).
- Unknown relation between `ProductID` and hotel id / GIATA.

---

## 2. Beach distance — `getEnrichedHotel` (v2, Project API)

- **URL:** `POST https://api.ygo.ai/v2/project/content/getEnrichedHotel`
- **Headers:** `Authorization: Bearer <token>`, `X-Project-ID: <project-id>`, `Content-Type: application/json`
- **Docs:** https://docs.ygo.ai/v2/get-enriched-hotel-4413471e0 , POI schema: https://docs.ygo.ai/v2/getenrichedhotel-poi-900622d0

### Request — send exactly ONE selector
```json
{ "HotelID": "<ygo-hotel-uuid>" }
```
or `{ "GlobalHotelID": "..." }` or `{ "ExternalHotelID": { "productid": "...", "giata": 123, "peakworkgoalid": 456 } }`
(`ExternalHotelID` sub-keys are AND-combined; a conflict returns 404.)

Status codes: 400 (missing/multiple/invalid selector), 404 (hotel not in content set), 429 (respect `Retry-After`).

### Relevant response fields (`Data`)
- `POIs[]`: `ID`, `Name` (locale map), `Type` (`beach` | `attraction` | `landmark` | …), `Distance` (number), `Unit` (`m` | `km` — **varies per item, normalize!**), `IsArea?`, `InArea?`, `Details?`
  - POI can be a single place or an area (`IsArea`), e.g. a beach. `InArea: true` ⇒ hotel is inside that area.
- `Location`: `Latitude`, `Longitude`, `CountryCode`, `Address` — no distance fields.
- `FactualAttributes[]`: `Key`, `Type`, `Name`, `Value`, `ValueType`, `ParentKey`, `IsFree`, `IsOnSite`, `Instances[]`
- `CheckIn.From`, `CheckOut.Until`, `GuestRating`, `GeneratedTexts`, `Rooms`, `Images`

### Nearest beach helper (TypeScript)
```ts
export type YgoPoi = {
  ID: string;
  Name: Record<string, string>;
  Type: string;
  Distance: number;
  Unit: 'm' | 'km' | string;
  IsArea?: boolean;
  InArea?: boolean;
};

export type NearestBeach = { name: string; meters: number; onBeach: boolean };

const toMeters = (d: number, unit: string) => (unit === 'km' ? d * 1000 : d);

export function getNearestBeach(pois: YgoPoi[] = [], locale = 'en-US'): NearestBeach | null {
  const beaches = pois
    .filter(p => p.Type === 'beach')
    .map(p => ({
      name: p.Name?.[locale] ?? Object.values(p.Name ?? {})[0] ?? 'Beach',
      meters: p.InArea ? 0 : toMeters(p.Distance, p.Unit),
      onBeach: !!p.InArea,
    }))
    .sort((a, b) => a.meters - b.meters);
  return beaches[0] ?? null; // null => no beach POI in YGO data; say "no info", don't guess
}

export function formatBeachAnswer(b: NearestBeach | null): string {
  if (!b) return 'אין לנו מידע על חוף בקרבת המלון.';
  if (b.onBeach) return `המלון נמצא על ${b.name}.`;
  return b.meters < 1000
    ? `החוף הקרוב (${b.name}) נמצא כ-${Math.round(b.meters)} מ' מהמלון.`
    : `החוף הקרוב (${b.name}) נמצא כ-${(b.meters / 1000).toFixed(1)} ק"מ מהמלון.`;
}
```

---

## 3. Suggested flow (backend proxy — never expose YGO token to the browser)

```
UI question ──► our API /hotels/{id}/ask
                 ├─ intent = beach/distance?  ─► getEnrichedHotel (cache per hotel) ─► getNearestBeach ─► answer
                 └─ else ─► sendMessage(Model="hotelinfo", ProductID) ─► last assistant message ─► answer
```
- Cache `getEnrichedHotel` per hotel (data is enriched content, not live).
- Simple intent detection is fine (keywords: `beach`, `חוף`, `ים`, `sea`, `distance`, `רחוק`, `מרחק`). No LLM needed.
- Handle 429 with `Retry-After`; 409/404 → graceful "no info" answer.
- Show source attribution when `hotelinfo` returns it (hotel data vs. guest reviews).

---

## 4. Open questions for YGO (blockers — mark as TODO in code)
1. Does `hotelinfo` use POI/distance data? Test: "How far is the hotel from the beach?" on a Cyprus (Leonardo) hotel in sandbox.
2. What is `ProductID` in `hotelinfo`? Is it Issta's productid (same as `ExternalHotelID.productid` in v2), YGO hotel UUID, or something else?
3. Does our token/contract include the v1 Client API (`sendMessage`), or only the v2 Content Enrichment API?
4. Is `ChatID` mandatory / must we call `createChat` first, or can we send a one-off question?
5. Exact `hotelinfo` response schema.
6. Hebrew support (`Locale: "he"`) for questions and answers.
7. Latency and pricing per `sendMessage` call; rate limits.
8. Scope of YGO's MCP offering (they advertise content delivery to AI assistants via MCP).