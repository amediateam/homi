# KV-FE-061 — Map selection card

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (approval: map packages via KV-FE-005, through KV-FE-058) |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-MAP-003 |
| Dependencies | KV-FE-058 (selection state from pins, stacks and clusters), KV-FE-047 (compact listing card); backend KV-BE-036 (API-008 `?preview=1`); decisions: DEV-013 `PROPOSED` |

## Goal

Tapping a pin, stack or max-zoom cluster shows a floating card with the compact listing preview; for several listings
a swipeable track with «{n} из {total}» syncs with the spiderfied pins (SCR-013). Previews load lazily for the current
and neighbouring slots; a failed preview shows an inline retry instead of spinning forever (LB-APP-017); with DEV-013
Telegram Back closes the card.

## Legacy reference

- SCR-013 (`03` §2); `$KVADRO_ROOT/demo/app/src/features/map/MapSelectionCard.jsx:17-127` (lazy loads `:22-37`, track
  sync `:44-80`, slots ±1 `:116-120`); selection state `gl/MapViewGL.jsx:64-100,186-203`; `gl/useClusterMarkers.js`
  (stack and cluster selections).
- Defects: LB-APP-017 (spinner forever), LB-APP-024 → DEV-013 (no Back handler).
- Contract: API-008 with `preview=1` (`08` §2: «With `preview=1` — at least the `ListingPreview`»), API-011.
- Visual baseline (KV-QA-019): `gl-pin-click` → `SCR-013-*.png`.

## Implementation

1. `frontend/app/app/(miniapp)/features/map/MapSelectionCard.tsx` with `selection = {ids, at}`, `favs`, `onFav`,
   `onOpen`, `onIndex`, `onClose`.
2. Single id: one `.map-card.glass` with the compact `ListingCard` (one photo, short verdict, no badges/eye) and a ×
   (aria `common.close`).
3. Several ids: header `map.stackOf` «{n} из {total}», a horizontal scroll-snap track with one glass slot per id; only
   slots within ±1 of the current index render content; scrolling to another slot → light haptic + `onIndex(i)`; an
   external index change (tap on a spiderfied pin) scrolls the track; a new id set scrolls the track to the start.
4. Loading: `GET /api/listings/:id?preview=1` for the current and adjacent ids, each requested once; results cached by
   id for the card's lifetime. **LB-APP-017 fix:** a failed slot shows an inline «Не загрузилось — повторить»
   (`feed.retry` with `common.loadFailed`) that refetches that id.
5. Close: ×, background tap on the map, entering drawing mode, a new points response (filters changed) — all from
   KV-FE-058. **DEV-013** (flag `dev013BackClosesMapCard`, default off): while the card is open it pushes a Back handler
   onto the layer stack (KV-FE-025) so Telegram Back closes the card and collapses the stack instead of leaving the map.
6. Tap a card → `onOpen(id, item)` (adds to session «seen», passes the preview to the listing layer, KV-FE-063); the
   heart toggles the favourite (KV-FE-047).
7. The locate button is hidden while the card is open (KV-FE-058).

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| loading slot | preview pending | centred spinner |
| loaded | preview arrived | compact card (texts of KV-FE-047) |
| failed slot | preview request failed | `feed.retry` «{error} — повторить» with `common.loadFailed` «Не загрузилось» (LB-APP-017 fix) |
| stack header | several ids | `map.stackOf` «{n} из {total}» |
| close | always | aria `common.close` «Закрыть» |
| hidden | no selection, drawing | card absent |

## Interaction

- Horizontal swipe through slots (scroll-snap), light haptic per slot change; tap opens the listing; × closes.
- Animation: card rise-in; reduced motion → none.
- Z-index 31 (above the tab bar, below sheets, `03` §3.6); positioned above the tab bar and the bottom safe area.
- Responsive: card width = column width (max 608 px); slots 85–90 % width so neighbours peek.

## Telegram integration

TMA-022 (DEV-013 Back handler), TMA-025 (haptics).

## Storage and analytics

- Storage: none.
- Analytics: none in legacy (LB-APP-037 lists the map card as untracked; KV-FE-035 may add `map/card` as a new name).

## Files

- `frontend/app/app/(miniapp)/features/map/MapSelectionCard.tsx` (new)
- `frontend/app/lib/deviations.ts` (flag `dev013BackClosesMapCard`)
- `frontend/app/tests/map/MapSelectionCard.test.tsx`

## API contract

- API-008 `GET /api/listings/:id?preview=1` → `200` with at least the `ListingPreview` keys; `404` / other errors →
  failed slot with retry.
- API-011 via the heart.

## Business rules

- Kept: SCR-013 behaviour (lazy ±1 loading, stack order = price order from KV-FE-058).
- Defect fix `APPROVED` (policy): LB-APP-017.
- DEV-013 `PROPOSED` behind its flag (test `todo('DEV-013 PROPOSED')`).

## Acceptance criteria

- A 7-listing stack requests previews for indexes 0 and 1 on open; swiping to 3 requests 2, 3, 4 lazily; no id is
  requested twice after success.
- A preview `500` shows «Не загрузилось — повторить»; tapping it refetches and shows the card.
- Tapping a spiderfied pin scrolls the track to that slot and updates «{n} из 7».
- Visual: side by side with the `gl-pin-click` baseline (`SCR-013`) — card glass, compact layout, close button equal.

## Tests

- Component (`MapSelectionCard.test.tsx`, mocked client): single vs stack layout, ±1 slot rendering, request dedupe,
  failed-slot retry, external index scroll, DEV-013 `todo`.
- E2E (`map.spec.ts` of KV-FE-058): `gl-pin-click` scenario.

## Edge cases

- The selected listing became hidden (hidden map changed): KV-FE-058 closes the selection.
- `404` for a merged id: the API redirects to the survivor (KV-BE-018); the card shows the returned listing.
- A stack of 50 ids: only three slots render content at any time.

## Security

- SEC-REQ-021: preview strings rendered as text.
- SEC-REQ-014 (server): previews of other users' data are not involved; only public listing previews.

## Definition of done

Approval recorded; `make ci-frontend` green; component and E2E tests green (or added when KV-FE-010 lands);
side-by-side review of the SCR-013 baseline recorded in the PR; parity gate G4 for F-MAP-003 ticked (`15` §4); the `09`
row updated; PR reviewed by the other developer.
