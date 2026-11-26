# Legacy golden fixtures (WP-41)

What the legacy API answers, as its contract describes it, for the `legacy` source driver's tests and for
`LegacyFakeServer`, which answers from these files while `legacy.fake` is on (`local`, `testing`). A legacy release
that changes one of these shapes must fail `ReferenceGoldenContractTest`, not a user (RK-26): when the audit of a new
release changes a shape, these files change in the same PR.

**Rule:** no real phone number, name, address, channel, key or analytics id. The values are HOMI's synthetic stub data
of WP-11 (`../v1/reference/default.*.json`, `../v1/cities/default.json`) turned into legacy's shape, so a translated
fixture equals the stub by value; the few legacy-only values (`bot_username`, `analytics`) are invented and end in
`fixture`, `.invalid` or similar.

They describe the legacy release pinned in `docs/migration/wave-1/baseline.md` (`index-YX9bFVws.js`).

| File | Legacy method | Source in the audit | What it exercises |
| ---- | ------------- | ------------------- | ----------------- |
| `meta.ru.json`, `meta.uz_Latn.json`, `meta.en.json` | `GET /api/meta` (API-001), in the language the request asked for | `docs/migration/08-api-inventory.md` API-001 (`MetaResponse`, `CityMeta`) | every key of the answer, the user part HOMI ignores (`locale`, `currency`, `theme`, `city`, `analytics`, `*_chosen`, `bot_username`, `max_subscriptions`); `center` as `[lat, lon]`; a city without `zoom` (12); `new_features` with `cards`, which HOMI drops (DEC-57); `renovations` without `rent_daily` (becomes `[]`) and with `owner`, which is not a deal (dropped); a locale HOMI does not serve (`uz_Cyrl`, dropped) |
| `meta.no_cities.ru.json` | `GET /api/meta` without `cities` | API-001 ("`cities` missing or empty → Tashkent from top-level `districts`/`zones`") | the one city `tashkent` built from the top-level lists |
| `cities.json` | `GET /api/cities` (API-002) | API-002 (`CityStats`: `code`, `counts`, `presets`, `typical`; unread `name`) | the renamed keys `presets` and `typical`; a city legacy knows and the reference does not (dropped) |
| `errors/not_found.json` | any unknown path | `08` §1.5 (`404 {"detail": "Not Found"}`) | the fake server's answer to a path it does not know |
| `errors/validation.json` | a `422` | `08` §1.5 (the Pydantic v2 shape with `literal_error`; `detail` is an array) | a contract error, never shown to a user |
| `errors/unauthorized.json` | a request without the service key | `08` §1.5 and Q-API-060 (the status for a refused key is the operator's; `401` is the default built without the answer) | the fake server's answer when the auth header is missing |
