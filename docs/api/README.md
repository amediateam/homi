# HOMI API v1 — conventions

Every client — the Mini App, the landing, the ARM, the bot's web views — talks to `https://api.homi.<tld>/api/v1`.
This page explains what every answer looks like. The rules come from ADR-0007, as amended by ADR-0017. The contract
itself is the generated document [`openapi.json`](openapi.json); the TypeScript types in `@homi/types` are generated
from it. The collector intake is described separately (ADR-0009).

## Envelope

A successful answer:

```json
{ "success": true, "data": { "number": 71234, "title": "2-room flat" }, "meta": { "source": "stub" } }
```

`message` is optional and only for people. Whether `meta` is present depends on the method. `204 No Content` has no
body and therefore no `meta`.

An error:

```json
{ "success": false, "message": "The given data was invalid.", "code": "validation_failed", "errors": { "deal": ["The selected deal is invalid."] } }
```

`code` is always present, is stable and is snake_case. Program logic reads `code`, never `message`. `errors` appears
only on `422` and maps each field to its messages.

## Error codes

| Status | `code` | When |
| ------ | ------ | ---- |
| 422 | `validation_failed` | A request field is invalid (`errors` lists them) |
| 401 | `unauthenticated` | No valid bearer token (ADR-0003) |
| 403 | `forbidden` | Not allowed, or the token lacks the ability |
| 404 | `not_found` | Unknown route, or a resource or listing that does not exist |
| 413 | `payload_too_large` | The request body is over the size cap |
| 429 | `rate_limited` | Too many requests; wait for the `Retry-After` seconds |
| 503 | `source_unavailable` | The data source of the method cannot answer; show the "could not load" state |
| other 4xx/5xx | `http_error` | Any other HTTP error |
| 500 | `server_error` | An unexpected failure; the message is hidden outside debug |

A method may define its own codes, which its OpenAPI entry documents. The media methods use `code` = `reason`
(`unsupported_mime`, `too_large`, `too_big`, `undecodable`, `presign_unavailable`, `upload_not_found`,
`forbidden_upload`), and the older `reason` key stays for them.

## `meta.source`

Every answer of a source method says which driver produced `data`:

| Value | Meaning |
| ----- | ------- |
| `stub` | Fixtures. The client shows a small "demo data" marker (`25` §4.4) |
| `legacy` | The legacy service, called by HOMI's servers only |
| `native` | HOMI's own code |

It always names the driver that actually answered. When a method falls back, `meta.source` names the driver it fell
back to. The value is the operator's choice per method and environment. `php artisan sources:list` shows it,
`sources:set` changes it on the next request, and every change is logged (`config/sources.php`).

## Cursor lists

Feed-like lists return a page and a cursor:

```json
{ "success": true, "data": [{ "number": 71234 }, { "number": 71230 }], "meta": { "source": "legacy", "next_cursor": "eyJiIjo3MTIzMH0" } }
```

Pass `next_cursor` back as `?cursor=` to get the next page. `meta.next_cursor` is always present, and `null` means
the list has ended. The cursor is opaque: do not parse it or build it. Favourites and history are paged the same way,
20 per page.

Older page-number lists (`?page[number]=&page[size]=`) put `page`, `size`, `total` and `last_page` in `meta` and
`next`/`prev` in `links`.

## Stub scenarios

While a method answers from stubs, the request header `X-Stub-Scenario: <name>` picks another fixture of that
method, for example `first_launch`. The header has an effect only when the driver is `stub`, so it is harmless
anywhere else. A scenario that a method does not know is ignored, so one value can stay set across many requests.
Each method lists its scenarios in its specification. Every stub method knows these four:

| Scenario | Answer |
| -------- | ------ |
| `source_unavailable` | `503 source_unavailable` |
| `rate_limited` | `429 rate_limited` with `Retry-After` |
| `unauthenticated` | `401 unauthenticated` |
| `forbidden` | `403 forbidden` |

Outside production the Mini App forwards the cookie `homi_stub_scenario` as this header (WP-22). The fixtures live in
`backend/resources/fixtures/v1/<area>/<name>.json`, in the shape of the data objects and sanitised: no real phones,
names, addresses or channel names. Frontend tests read the same files through `fixture("<area>/<name>")` of
`@homi/testing`.

## Locale and currency

The locale comes from `Accept-Language`: the first supported tag (`ru`, `uz`, `en`), else `ru`. The currency comes
from the user's settings, and until they exist (WP-40) it is `USD`.

## Keeping the contract current

| Change | Then run | CI fails when skipped |
| ------ | -------- | --------------------- |
| A route, form request or resource of `/api/v1` | `cd backend && composer openapi:export` | `composer openapi:check` (in `composer ci:check`) |
| `docs/api/openapi.json` | `cd frontend && pnpm types:generate` | `pnpm types:check` (in `make ci-frontend`) |

Never edit `openapi.json` or `frontend/packages/types/src/generated/api.ts` by hand. Locally the documentation UI is at
`https://api.homi.loc/docs/api`. On staging and production it sits behind the same nginx basic auth as Horizon and
Telescope.
