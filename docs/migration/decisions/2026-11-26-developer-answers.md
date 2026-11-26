# Developer's answers of 2026-11-26

Conventions: [`../README.md`](../README.md). The record of the questions asked on 2026-11-26, while WP-40 (sign-in,
users, settings, access gate, limits) was being built. Answers are quoted in Russian as written or as the option
chosen.

## The threshold of the daily cap on opening listings (DEC-104)

Question (asked in Russian): WP-40 brings HOMI's own per-user daily cap on opening a full listing card
(`GET /listings/{number}`); over it the answer is `429 rate_limited` with `reason: "daily"` (DEC-59). Legacy's number
is unknown (Q-API-085). The plan is a starting number in configuration, a measurement on staging and production, then
a tighter value. Which starting number?

Options:

- 300 a day (recommended): a soft start that an active seeker rarely reaches in a day.
- 150 a day: stops a harvest of the catalogue, but an active user can reach it at the peak of a search.
- 500 a day: almost no cap, a guard against scripts only; the measurement shows the real number.
- 100 a day: a strict start, close to a legacy-like limit for an ordinary seeker, with a higher risk of false hits.

Answer: «100 в сутки». Registered as **DEC-104** in [`../24-three-wave-strategy.md`](../24-three-wave-strategy.md)
§8.1. Consequence: `config('rate_limits.listing_opens_per_day')`, read from `RATE_LIMIT_LISTING_OPENS_PER_DAY`
(default 100), so the production track can change it without a release.

## Whether the preview form counts (DEC-105)

Question: with a cap of 100 full cards a day, does the preview form (`GET /listings/{number}?preview=1`) count? It is
the light card of the map selection and of the listing layer before the full card arrives; in the stub scenario
`daily_limit` it answers as usual.

Options:

- Do not count the preview (recommended): only full cards count; the preview still answers after the cap, as the stub
  does today, and stays under the per-minute limiter `v1-listing` (120 a minute).
- Count the preview too: every preview spends the cap, and after 100 the preview answers `429 daily` as well; the map
  and the previews would spend it quickly.

Answer: «Не считать preview (Рекомендуется)». Registered as **DEC-105**. With DEC-104 it answers Q-API-085.

## Team accounts during a pause (DEC-106)

Question: WP-40 left one point open. The gate has a server switch `ACCESS_PAUSED` (DEC-60, off by default); while it is
on, sign-in and every bearer method answer `403 access_denied` with `reason: "paused"`. Do team accounts
(`users.is_team`, set by hand) pass a pause? The task `KV-BE-009` says "team accounts are not special for the gate".

Options:

- The team passes the pause (recommended): the team can check the app on production before the pause is lifted;
  `blocked` still wins over everything, and `is_team` gives no other privilege.
- The pause is for everyone: `is_team` gives no exception, as in `KV-BE-009`; the team checks the app on staging only.

Answer: «Команда проходит паузу (Рекомендуется)». Registered as **DEC-106**.

## What the daily cap counts (DEC-107)

Question: the cap is 100 full cards in 24 hours, the preview not counted. One open in the app is one request, but a
return to the same card from the favourites or a tap on «Повторить» is a new request. What does the cap count?

Options:

- Distinct listings (recommended): 100 different cards in 24 hours; re-opening a card already counted in the window
  does not spend the cap, also after it is reached. Legacy's text says the same: «За сутки открыто очень много
  объявлений».
- Every request: any open of a full card counts, re-opens and «Повторить» included; simpler (Laravel's standard
  limiter), but an active user reaches the cap sooner.

Answer: «Разные объявления (Рекомендуется)». Registered as **DEC-107**. Consequence: the window is 24 hours, not the
calendar day (legacy's English text: "in the past 24 hours"); as built it is fixed: it starts at the first counted card,
lasts 24 hours and does not slide (WP-40 "As built"); only a `200` full card counts, so a missing listing or an error
does not.

## Whether the end-to-end job runs on backend changes (DEC-108)

Question (asked while #124 was in review): the CI job `frontend-e2e` runs only on changes of `frontend/**`, but it
boots the API from the PR's tree, and since WP-40 the app depends on the backend's boot checks, stub mode and access
gate. The next packages of stage C are almost all backend, and without the e2e job they could break the app unseen.
Should the job also run on backend changes? One run is about 30 minutes of Actions.

Options:

- Yes, on the backend's code (recommended): `backend/app`, `bootstrap`, `config`, `routes`, `database/migrations`,
  `resources/fixtures`, `composer.lock` and `.env.example` join the paths; a PR with documentation only does not run it.
- No, as today: the job stays frontend-only; before a backend PR the agent runs the suite locally
  (`scripts/dev/e2e-local.sh`). Saves Actions minutes, but the protection rests on discipline.
- All of `backend/**`: any backend change, tests and docs under `backend/` included; simplest, more needless runs.

Answer: «Да, на код бэкенда (Рекомендуется)». Registered as **DEC-108**. Consequence: the eight paths are in
`pull_request.paths` of `.github/workflows/frontend-e2e.yml` since #124.
