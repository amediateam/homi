# KV-FE-080 — Radar follow nudge

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-RADAR-007 F-RADAR-009 F-RADAR-010 |
| Dependencies | KV-FE-028 (`kv-nudge` storage and DeviceStorage restore), KV-FE-034 (journal events), KV-FE-048 (search list, apply hook), KV-FE-074 (radar actions, list store); decisions: DEV-021 `PROPOSED`; Q-APP-005 |

## Goal

1.8 s after the user applies custom filters on the search list, the Mini App offers «Включить радар по этому поиску?»
with the expected flow (SCR-040), under the legacy frequency rules stored in `kv-nudge`, and never crashes when the flow
answer is empty (LB-APP-006).

Since the pinned release `index-DY_DH7h-.js` (`wave-1/baseline.md`) the same nudge family also has the return
banner «С вашего прошлого захода — N новых» (SCR-046, API-035, F-RADAR-009) and the radar card inside the search feed
(SCR-047, F-RADAR-010). In Wave 1 they are built by WP-30 on the contract of WP-12 (`GET /listings/new`); the
line references below are those of the audited release.

## Legacy reference

- SCR-040 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:9-60` (`AlertNudge`, `NUDGE_TIMEOUT_MS =
  10000`), `$KVADRO_ROOT/demo/app/src/app/useFollowNudge.js:9-80` (`FOLLOW_NUDGE_DELAY_MS = 1800`, stale-drop),
  `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:6-93` (`kv-nudge`, djb2 hash of `filtersKey` in base36,
  cooldown 8 h, 3 closes → 14-day snooze, 40 hashes).
- Wiring and events: `$KVADRO_ROOT/demo/app/src/app/App.jsx:109-112` (`follow_prompt_expired`), `:181-189`
  (`canShowNudges`), `:614-633` (close → `markNudgeClosed` + `follow_prompt_closed`; enable → `resetNudgeCloses` +
  `subscribe(filters, 'prompt')`).
- Rules: BR-APP-043 (when it appears), BR-APP-046 (nudges only on search/list with nothing open), BR-APP-013 (custom
  filters), BR-APP-044 (flow wording).
- Defects: LB-APP-006 (empty flow → TypeError in render), LB-APP-033 → DEV-021, LB-APP-007 (filters with `undefined`
  booleans count as custom; fixed by the normaliser of KV-FE-019).
- No visual baseline in KV-QA-019; compare with the legacy markup and the `03` §3.6 tokens (z-index 35, `rise-in`).

## Implementation

1. `frontend/app/lib/radar/followNudge.ts`: `readNudgeState()` / `writeNudgeState()` on `kv-nudge` through the storage
   layer of KV-FE-028 (mirrored and restored, so the restore happens before the first decision, LB-APP-021 fix);
   corrupted or missing JSON → `{asked: [], closed: 0, quietUntil: 0}`.
2. Keep the legacy hash exactly — djb2 over `filtersKey(filters)` (KV-FE-019), `>>> 0`, base36 — so hashes already
   stored by the legacy client stay valid after S4 (`03` §3.2 continuity).
3. `shouldShowFollowNudge(filters, subs, maxSubs)`: filters custom (BR-APP-013), no radar with the same filters, radar
   count `< maxSubs` (`meta.max_subscriptions ?? 10`), `now ≥ quietUntil`, `now − lastShown ≥ 8 h`, hash not in `asked`.
   `markNudgeAsked` keeps the newest 40 hashes and sets `lastShown`; `markNudgeClosed` counts closes and after 3 in a
   row sets `quietUntil = now + 14 days` and resets the counter; `resetNudgeCloses` on «Включить».
4. `useFollowNudge.ts`: the search list's apply action (KV-FE-048) sets a candidate; when the nudge may show
   (`tab = search`, `view = list`, no listing, no filters / quick / city / sort sheet, no radar editor), wait 1 800 ms;
   drop the candidate if the filters changed; otherwise check the rules, fetch `GET /api/feed/flow` with an
   `AbortSignal`, normalise (anything that is not an object with numeric `week` and positive `days` → `null`, LB-APP-006
   fix), mark asked, send `follow_prompt_shown`, show.
5. `FollowNudge.tsx` (`.nudge` card, z 35): radar icon 20 px, title, subtitle, optional flow line, «Включить» (medium
   haptic) and × (`aria-label` `common.close`). It hides itself after 10 s (`follow_prompt_expired`), on × (closed
   counter + `follow_prompt_closed`), on «Включить» (reset counter, `actions.subscribe(filters, 'prompt')` of KV-FE-074)
   and whenever the current filters stop matching. A visible toast hides it (legacy `!toast`).
6. Flow line: `null` → no line; `week = 0` → `nudge.none`; `week/days < 1` → `alert.week`; else `alert.day` with the
   rounded per-day value. DEV-021 (flag `dev021OneFlowVocabulary`) switches to the shared vocabulary of KV-FE-018.

## States and texts

| State | Texts (keys, ru) |
| ----- | ---------------- |
| shown | `nudge.title` «Включить радар по этому поиску?»; `nudge.what` «Новые — сразу в чат»; button `nudge.enable` «Включить» |
| flow none | `nudge.none` «Таких пока нет — радар пришлёт, как появятся» |
| flow week / day | `alert.week` «{n} за неделю» / `alert.day` «≈{n} в день» |
| flow unknown (`null`, `204`, error) | no flow line (never a crash) |
| enabling | the nudge closes at once; the result toast comes from KV-FE-074 |
| hidden | conditions not met, toast visible, other overlay open |

## Interaction

- Appears with `rise-in` from the bottom above the tab bar; auto-hide after 10 s; no Back handler (overlay without its
  own layer, legacy); a tap outside does not close it.
- Lite mode: solid background instead of glass (KV-FE-027). Reduced motion: no rise animation.
- Layout: full content width minus 16 px gutters; z 35 on the legacy ladder (above the tab bar 30 and the mini title
  31, below sub-pages 40 and the listing layer 45, `03` §3.6).

## Telegram integration

TMA-025 (medium haptic on «Включить»), TMA-033 (write access through the subscribe flow), TMA-037 (DeviceStorage mirror
of `kv-nudge`).

## Storage and analytics

- `kv-nudge` JSON `{asked: string[≤40], closed: number, quietUntil: number, lastShown: number}` — mirrored to
  DeviceStorage and restored (KV-FE-028).
- Journal events (KV-FE-034): `follow_prompt_shown`, `follow_prompt_expired`, `follow_prompt_closed` (no properties).

## Files

- `frontend/app/lib/radar/followNudge.ts`, `frontend/app/app/(miniapp)/features/feed/useFollowNudge.ts`,
  `frontend/app/app/(miniapp)/features/feed/FollowNudge.tsx` (new)
- `frontend/app/tests/radar/followNudge.test.ts`, `FollowNudge.test.tsx`

## API contract

- API-006 `GET /api/feed/flow?<FilterQuery>` → `200 {week, days, options?}`; `204`, empty body, non-object or error →
  `null` (no line). Request aborted when the candidate is dropped.
- API-019 through KV-FE-074 with `entry: "prompt"`.

## Business rules

- Kept: BR-APP-043, BR-APP-046, BR-APP-013, BR-APP-044.
- Defect fixes `APPROVED` (policy): LB-APP-006, LB-APP-007 (through KV-FE-019), LB-APP-021 (restore before use).
- DEV-021 `PROPOSED` (flag).

## Acceptance criteria

- Applying custom filters shows the nudge after 1.8 s with the flow line; default filters never show it.
- The same filters are not offered twice; a second offer for other filters within 8 h is suppressed; 3 consecutive ×
  closes silence it for 14 days.
- A flow answer `204` shows the nudge without a flow line (no crash screen).
- A `kv-nudge` value written by the legacy client (same hash for the same filters) suppresses the offer for those
  filters in the new app.
- Events are sent once per show / expiry / close.

## Tests

- Unit `followNudge.test.ts` (fake clock): rules matrix (custom vs default, existing radar, at limit, cooldown, snooze,
  asked list size 40, corrupted JSON), hash compatibility fixtures computed from the legacy algorithm.
- Component: flow `null` / `{week:0}` / `{week:3,days:7}` / `{week:21,days:7}`; auto-hide at 10 s; × increments closes;
  `todo('DEV-021 PROPOSED')`.
- E2E: apply filters → nudge → «Включить» → `POST` with `entry: "prompt"`.

## Edge cases

- Filters change during the 1.8 s wait or the flow request → dropped, request aborted, nothing marked.
- The user opens a listing while the nudge is visible → hidden; it does not come back for the same filters (already
  asked).
- `localStorage` unavailable → in-memory state for the session; DeviceStorage still mirrored where possible.

## Security

- SEC-REQ-007 (no credentials in `kv-nudge`; only hashes and timestamps), TMA-009 (no filter contents in events).

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); review against the legacy markup recorded in the PR;
parity gate G4 for F-RADAR-007 ticked (`15` §4); row in `09` updated; PR reviewed by the other developer.
