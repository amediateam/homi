# Wave 1 — pass inside Telegram

The record of the pass inside Telegram of WP-33 (step 15 of
[`WP-33-frontend-acceptance.md`](../migration/wave-1/WP-33-frontend-acceptance.md), "Pass inside Telegram"). It is
empty until the pass: step 15 fills it on staging first, then on production after the same commit is deployed there.
Each run also gets one row in [`verification-log.md`](verification-log.md). Test accounts only: no real user's data in
any capture, note or screenshot.

## How to fill it

1. Before the pass, the manual run of the suite (`workflow_dispatch` of `frontend-e2e` with `full`, DEC-100) is green
   on the deployed commit. Write its run id under "Runs".
2. One run is one client on one device on one environment. Add its row to "Runs", then copy the run template below
   once per run and fill it.
3. The session mode is read from the `session_mode` property of PostHog's live events of the staging project
   (WP-32), for every client; on Telegram Web also from the browser's tools (the cookie list, the `Authorization`
   header on `/bff/*`). Production is checked the same way once its PostHog key exists; until then Web only.
4. A failed row gets a note and an issue or a fix (step 16): a small fix in WP-33, otherwise back to the owning package
   with its specification corrected. Repeat the affected rows after the fix and add a new run.
5. Evidence for the PR: this record, one screenshot per screen group and client, and a screen recording of the Back
   order on iOS and Android.

## Runs

| # | Date | Environment | Commit | Client and version | Device and system | Expected mode | Seen mode | Manual suite run | Result |
| - | ---- | ----------- | ------ | ------------------ | ----------------- | ------------- | --------- | ---------------- | ------ |

The clients and what each one must show (the table of "Pass inside Telegram"):

| Client | Device | Expected mode | Notes |
| ------ | ------ | ------------- | ----- |
| Telegram iOS, current | a phone with a notch | cookie | fullscreen, safe areas, swipe-back |
| Telegram Android, current | a mid-range phone; a low-end one if available | cookie | hardware Back, `tel:`, lite mode by itself on the low-end phone |
| Telegram Desktop | macOS or Windows | cookie | mouse, window resize, no fullscreen request |
| Telegram Web | Chrome, Safari, Firefox | recorded per browser | once more in each with cookies blocked for the app host, which must give header mode |

## Run template

Copy from here to the end of the file once per run, as `## Run <#> — <client>, <environment>`.

### Checklist rows

The rows of the acceptance checklist of WP-33. Write `pass`, `fail` (with a note), or `n/a` with the reason (for
example a row that stubs or radars switched off cannot show inside Telegram, listed below).

| Group | Rows | Pass | Fail | n/a | Notes |
| ----- | ---- | ---- | ---- | --- | ----- |
| Screens | 1 – 48 | | | | |
| Screens of the owner cabinet | 1 – 14 (only once WP-89 switches the cabinet on there, DEC-81) | | | | |
| Scenarios of `index-CIa0Ldj2.js` | 1 – 32 | | | | |
| Scenarios of `index-YX9bFVws.js` | 1 – 17 | | | | |

Failed rows:

| Group | Row | What was seen | Screenshot | Fix or issue |
| ----- | --- | ------------- | ---------- | ------------ |

### Checked by hand

Nothing automated can see these; tick each one on this client, or write why it does not apply.

- [ ] Haptics on taps, results and gestures.
- [ ] Fullscreen and the position of the collapsed title.
- [ ] Safe areas at the top and the bottom.
- [ ] The native BackButton and SettingsButton, and Android's hardware Back, in the order sheet, overlay, screen.
- [ ] Drag-to-close with a flick.
- [ ] Pull-to-refresh, with vertical swipes off.
- [ ] Pinch and double tap in the photo viewer.
- [ ] Drawing an area with one finger and moving the map with two.
- [ ] The theme follows Telegram while the app is open.
- [ ] The keyboard over the price fields.
- [ ] The system sheets: location permission, link hand-off, the home-screen dialog, the share picker's fallback
      link.
- [ ] The «Обновите Telegram» screen on an old device, if one exists.
- [ ] Android only: lite mode turns on by itself on the low-end phone.
- [ ] Telegram Web only: with cookies blocked for the app host, the app runs in header mode.

### Not reachable here

Accepted in the suite now and done by hand in WP-48, while the answers are stubs: the no-access screen (gate open,
DEC-43); the write-access prompt after `no_chat` and the restart-bot confirm; the radar limit; the prepared-message
share window and a real call page; a session that expires by age. On staging a tester on Telegram Web may set
`homi_stub_scenario` in the browser to see these; on production nothing can.

Not reachable inside Telegram at all in WP-33: the radar screens beyond their "soon" state, and the three nudges and
cards that offer a radar. Staging and production keep radars switched off until WP-57 (DEC-51). Rows 26 … 31, 40, 46
and 47 of the screen table are proven by the suite and on the local stack; here only the "soon" state is checked.

Seen on this run anyway, or worth listing for WP-48:

-
