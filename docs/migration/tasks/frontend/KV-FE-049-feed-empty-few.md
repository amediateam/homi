# KV-FE-049 — Feed empty and few-results states

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FEED-002 |
| Dependencies | KV-FE-048 (list and its slot), KV-FE-074 (subscribe flow, entry `few`); uses `switchDeal` / `defaultFilters` of KV-FE-020 and `cityStats` of KV-FE-040; decisions: DEV-024 `PROPOSED` |

## Goal

When a list ends with few or no items the user gets the legacy guidance (SCR-009): the few-results note with «see the
other deal», «turn on a radar» and «another city», or the mascot empty states for search, favourites and history —
and, with DEV-024, no dead-end «Сбросить фильтры» when nothing is filtered.

## Legacy reference

- SCR-009 (`03` §2); `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:16-49` (`FeedEmpty`, `FEW_RESULTS = 10`),
  `:89-92`, `:137-138`; `$KVADRO_ROOT/demo/app/src/app/FewResultsNote.jsx:18-60`;
  `$KVADRO_ROOT/demo/app/src/app/App.jsx:420-439` (`renderFewNote`), `:305-313` (`subscribeHere`), `:525` (reset).
- Rules: BR-APP-025 (when the note shows), BR-APP-041 (radar from the note, entry `few`), BR-APP-022 (reset target),
  BR-APP-002 (deal switch). Defects: LB-APP-038 → DEV-024.
- Mascots `empty-magnifier.svg` (search), `empty-shrug.svg` (favourites, history), 120 px (`03` §3.6; brand assets per
  FD-8 of `12` §9.1).
- Visual baseline (KV-QA-019): `x-feed-empty` → `SCR-009-*.png`; favourites/history empty have no baseline — compare
  against the legacy strings and layout.

## Implementation

1. `frontend/app/app/(miniapp)/features/feed/FeedEmpty.tsx` (`source: 'feed' | 'favorites' | 'history'`) and
   `FewResultsNote.tsx`; both mounted by the list of KV-FE-048 after the last page (`done`), never on error.
2. Few-results note conditions (BR-APP-025): source `feed`, no error, fewer than 10 **visible** items, **and** no
   active filters (`countActiveFilters = 0`), city stats loaded and the city has a name. Otherwise the plain empty
   state shows when the visible list is empty.
3. Note content: title `feed.nothing` when 0 items, else `feed.fewSale` for sale and `feed.fewRent` for rent (daily
   included); hint `feed.fewHint` with `{city}`; buttons:
   - other deal — `otherDeal = sale` unless the deal is sale (then `rent_long`); shown only when
     `cityStats.counts[otherDeal] > count`; label `feed.seeSale` / `feed.seeRent` with `{n}`; action `switchDeal`
     (keeps geography, BR-APP-002);
   - `feed.subscribeHere` with the radar icon — hidden when a radar with the same filters exists (`sameFilters`);
     action `subscribe(filters, 'few')` of KV-FE-074;
   - `feed.otherCity` (text button) — only with more than one city; opens the full filters sheet (KV-FE-050).
4. Search empty state: magnifier mascot, `feed.nothing`, `feed.nothingHint`, button `feed.resetFilters` →
   `defaultFilters(baseDeal(deal), city)` (KV-FE-020). DEV-024 flag `dev024ResetOnlyWithActiveFilters` (default off):
   with zero active filters the reset button is replaced by «another deal / another city / radar» actions reusing the
   note buttons.
5. Favourites empty (`feed.favEmpty`, `feed.favEmptyHint`) and history empty (`feed.histEmpty`, `feed.histEmptyHint`)
   with the shrug mascot, tall layout.

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| few, 0 items | conditions of step 2, 0 visible | `feed.nothing` «Ничего не нашлось» + `feed.fewHint` «{city}: новых объявлений немного. Включите радар — он пришлёт новые в чат, как только появятся.» |
| few, rent | 1–9 visible, rent | `feed.fewRent` «Это все объявления об аренде» + hint |
| few, sale | 1–9 visible, sale | `feed.fewSale` «Это все объявления о продаже» + hint |
| note buttons | per rules | `feed.seeSale` «Смотреть продажу · {n}», `feed.seeRent` «Смотреть аренду · {n}», `feed.subscribeHere` «Включить радар по этому поиску», `feed.otherCity` «Другой город» |
| search empty | 0 visible, note not shown | `feed.nothing` «Ничего не нашлось», `feed.nothingHint` «Попробуйте ослабить фильтры», `feed.resetFilters` «Сбросить фильтры» |
| favourites empty | source favourites, 0 | `feed.favEmpty` «Здесь пока пусто», `feed.favEmptyHint` «Нажмите ♡ на объявлении, чтобы сохранить его» |
| history empty | source history, 0 | `feed.histEmpty` «Вы ещё ничего не открывали», `feed.histEmptyHint` «Здесь будут объявления, которые вы смотрели» |
| subscribing (disabled) | subscribe request in flight | radar button disabled; toasts from KV-FE-074 |

## Interaction

- Buttons give light haptics; the deal switch re-creates the list and scrolls to the top.
- No gestures or animations beyond the shared button styles; reduced motion respected.
- Responsive: centred column, mascot 120 × 120 px.

## Telegram integration

TMA-033 indirectly: the radar button runs the chat-access flow of KV-FE-030 through KV-FE-074. TMA-025 (haptics).

## Storage and analytics

- Storage: none.
- Analytics: no events of its own (radar creation sends none in legacy; the `entry: "few"` value travels in the API body).

## Files

- `frontend/app/app/(miniapp)/features/feed/{FeedEmpty,FewResultsNote}.tsx` (new)
- `frontend/packages/ui/src/assets/mascots/{empty-magnifier,empty-shrug}.svg` (brand layer, FD-8)
- `frontend/app/lib/deviations.ts` (flag `dev024ResetOnlyWithActiveFilters`)
- `frontend/app/tests/feed/FewResultsNote.test.tsx`

## API contract

- Reads `CityStats.counts` from API-002 (via KV-FE-040).
- Radar button → API-018 `GET /api/subscriptions` then API-019 `POST /api/subscriptions` body
  `{"filters": SearchFilters, "entry": "few"}` or API-021 `PATCH /api/subscriptions/:id {"active": true}` — owned by
  KV-FE-074.

## Business rules

- Kept: BR-APP-025, BR-APP-041 (entry `few`), BR-APP-022, BR-APP-002.
- DEV-024 `PROPOSED` behind its flag (test `todo('DEV-024 PROPOSED')`).

## Acceptance criteria

- 3 visible results, no active filters, stats loaded: the note shows «Это все объявления об аренде», the city hint, and
  «Смотреть продажу · 120» when the city has 120 sale listings; it does not show the other-deal button when the other
  deal has ≤ 3.
- With one active filter and 0 results: the plain empty state with «Сбросить фильтры»; reset returns the deal defaults
  of the base deal and the current city.
- An identical radar exists → no radar button.
- Only one city in `meta` → no «Другой город».
- Visual: side by side with the `x-feed-empty` baseline (`SCR-009`) — mascot, texts and button order equal.

## Tests

- Component (`FewResultsNote.test.tsx`): truth table of the note conditions (active filters, stats, city name, error,
  count 0/9/10); other-deal mapping (sale ↔ rent_long, daily → sale); button visibility; each source's empty state;
  DEV-024 `todo('DEV-024 PROPOSED')`.
- E2E (in `feed.spec.ts` of KV-FE-048): `x-feed-empty` scenario; note → «Смотреть продажу» switches the deal.

## Edge cases

- City stats arrive after the list finished: until then the plain empty state shows (legacy, the LB-APP-038 case) and
  is replaced by the note when they arrive; with DEV-024 on, that interim state offers no reset button.
- Locally hidden listings reduce a 10-item list to 9: the note may appear (visible count rule).
- `few` radar creation hits the limit or `no_chat`: handled by the toasts of KV-FE-074.

## Security

- SEC-REQ-021: the city name is a server string rendered as text inside the hint.

## Definition of done

`make ci-frontend` green; component and E2E tests green (or added when KV-FE-010 lands); side-by-side review of the
SCR-009 baseline recorded in the PR; parity gate G4 for F-FEED-002 ticked (`15` §4); the `09` row updated; PR reviewed
by the other developer.
