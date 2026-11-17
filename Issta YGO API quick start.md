# Issta: YGO API quick start

Nov 10, 2026 · @Yono

## Overview

Issta has its own YGO project with the 8 Leonardo hotels in Cyprus, enriched in English (en-US) and Hebrew (he-IL). This page has what you need for the first calls: access, a few example requests, and which endpoint to use for what. The full API reference is at [docs.ygo.ai](https://docs.ygo.ai/).

## Access

All endpoints are `POST` requests to `https://api.ygo.ai` with a JSON body. Every request carries two headers: your project key as a Bearer token, and your project ID. The two must belong to the same project, or the request is rejected. See [Authentication](https://docs.ygo.ai/authentication-370683m0).

| What | Value |
| --- | --- |
| Base URL | `https://api.ygo.ai` |
| Path pattern | `/v2/project/{product}/{operation}` |
| Project ID (`X-Project-ID`) | `01a1ac5e-3596-7f4c-bf1c-5917f5035f3b` |
| Project key (`Authorization: Bearer …`) | `proj_…` (sent separately) |
| Content type | `application/json` |

```bash
curl -X POST https://api.ygo.ai/v2/project/content/listEnrichedHotelSummaries \
  -H "Authorization: Bearer $YGO_PROJECT_KEY" \
  -H "X-Project-ID: 01a1ac5e-3596-7f4c-bf1c-5917f5035f3b" \
  -H "Content-Type: application/json" \
  -d '{"Limit": 10, "Offset": 0}'
```

Keep the project key out of client-side code. It gives full read access to the project.

## Example requests

All three examples use the base URL and headers from Access. There is no language parameter: every response holds all project locales, with Hebrew under the `he-IL` key and English under `en-US` (in `Names`, `GeneratedTexts`, `GuestRating.Texts` and image descriptions).

### 1. List the hotels in your project

`POST /v2/project/content/listEnrichedHotelSummaries` returns a light list: ID, name, stars, city, coordinates, status. Use it to get the hotel IDs ([reference](https://docs.ygo.ai/list-enriched-hotel-summaries-4415255e0)).

```json
{
  "Limit": 50,
  "Offset": 0
}
```

### 2. Get one hotel with all its content

`POST /v2/project/content/getEnrichedHotel` returns the full hotel: texts, facts, POIs, images, rooms, guest rating ([reference](https://docs.ygo.ai/get-enriched-hotel-4413471e0)). Send exactly one selector, for example the YGO hotel ID from step 1:

```json
{
  "HotelID": "<HOTEL_ID>"
}
```

Or your own identifier, such as GIATA:

```json
{
  "ExternalHotelID": { "giata": 123456 }
}
```

### 3. Get several hotels with all their content

`POST /v2/project/content/listEnrichedHotels` returns full hotels, up to 50 per page ([reference](https://docs.ygo.ai/list-enriched-hotels-4413472e0)). Without a filter it pages through the whole project, so for 8 hotels one call is enough:

```json
{
  "Limit": 50,
  "Offset": 0
}
```

### Reading the Hebrew text

Localized fields are objects keyed by locale. A simplified sketch of the shape (not a full response):

```json
{
  "Data": {
    "ID": "<HOTEL_ID>",
    "Names": { "en-US": "…", "he-IL": "…" },
    "GeneratedTexts": { "en-US": { … }, "he-IL": { … } }
  }
}
```

## Which endpoint to use when

Use the summaries for lists and the full hotel only when you need its content. A full hotel with all images and both languages can be several hundred KB, while a summary is small and fast.

| Endpoint | Returns | Max per page | Use it for |
| --- | --- | --- | --- |
| `listEnrichedHotelSummaries` | ID, name, stars, city, coordinates, status | 100 | Hotel lists, getting IDs, checking what changed (`UpdatedAt`) |
| `getEnrichedHotel` | One full hotel | 1 | A hotel detail page |
| `listEnrichedHotels` | Full hotels | 50 | Loading or syncing the whole project's content |

## Errors, limits and support

Errors come back with an `Error` object (`Code`, `Message`) in place of `Data`. Every endpoint is rate-limited: on a `429`, wait the seconds in the `Retry-After` header and retry. A `404` on a hotel means it is not in your project. See [Error Handling & Limits](https://docs.ygo.ai/error-handling-limits-370684m0).

Every response has an `X-Trace-ID` header. Include it when you contact Yono Mittlefehldt at <yono@ygo.ai>.

## Sources

- [YGO API docs](https://docs.ygo.ai/)
- [Authentication](https://docs.ygo.ai/authentication-370683m0)
- [Core Concepts](https://docs.ygo.ai/core-concepts-370687m0)
- [Error Handling & Limits](https://docs.ygo.ai/error-handling-limits-370684m0)
- [Get enriched hotel](https://docs.ygo.ai/get-enriched-hotel-4413471e0), [List enriched hotels](https://docs.ygo.ai/list-enriched-hotels-4413472e0), [List enriched hotel summaries](https://docs.ygo.ai/list-enriched-hotel-summaries-4415255e0)
