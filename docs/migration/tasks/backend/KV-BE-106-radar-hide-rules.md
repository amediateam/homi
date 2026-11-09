# KV-BE-106 — Radar hide rules service and the `hidden` count

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-HIDE-004, F-RADAR-004 |
| Dependencies | KV-DB-009 (`radar_hide_rules`), KV-BE-100, KV-BE-041 (author identity for `author` rules), KV-BE-023 (search predicates); DEV-033, DEV-034 `PROPOSED`; Q-API-032, Q-BOT-028, Q-DATA-012 |

## Goal

The server part of the bot's «Скрыть похожие» exists once: a rule (channel, district, and the promised author kind)
attached to a radar suppresses matching listings in that radar's deliveries, the radar reports how many listings its
rules hide (`Subscription.hidden`), and «🙉 Показать скрытое» / `PATCH {unhide:true}` clears the rules — with the
one-by-one removal and the user-wide scope prepared behind configuration.

## Legacy reference

- `$KVADRO_ROOT/docs/api.md:376` (`hidden`), `:771-791` (`unhide`); `$KVADRO_ROOT/docs/telegram-bot.md:711-720`
  (hide submenu, «Показать скрытое»).
- Mock: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:105-107` (`hidden: 2`).
- Bot: BOT-061, BTN-044, BTN-045, BTN-046, BTN-047 (`04` §3.10, §4.1); radar card «🙈 скрыто: …» (`04` §3.11).
- Audit IDs: ENT-009, BR-API-091, BR-BOT-063, BR-APP-047; LB-BOT-024, LB-BOT-025, LB-DATA-006; DEV-033, DEV-034.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rule 6, indexes) and KV-BE-041 (`listing_authors`, author key).
2. `php artisan make:class Services/Radar/RadarHideRuleService --no-interaction`:
   - `add(User, Radar, HideRuleKind, int $targetId): RadarHideRule` — kinds `channel` (`source_channels.id`),
     `district` (`districts.id`), `author` (`listing_authors.id`, only when `config('radar.author_hide_rules')`, default
     false — promised by the bot tip, never observed); idempotent (`insertOrIgnore` on the KV-DB-009 unique key).
   - `addFromListing(User, Listing, HideRuleKind, ?Radar $origin)`: the bot passes the radar of the delivered card
     (`bot_listing_messages.radar_id`, KV-TG-022). Without one (card from `/fav`, a deep link, a starter list of a
     deleted radar): with `config('radar.hide_rules_user_wide')` (DEV-034 `PROPOSED`, default false) off → the rule is
     added to every **active** radar of the user whose filters match the listing (spec for Q-BOT-028); if none matches,
     to all the user's radars. With DEV-034 on → one user-wide rule (`radar_id` null, `user_id` set — the column KV-DB-009
     notes for later) shown in «Скрытое».
   - `remove(User, RadarHideRule)` (DEV-033 `PROPOSED`, bot one-by-one removal) and `clearAll(Radar)` (`PATCH
     {unhide:true}`, BR-API-091).
   - `rulesFor(Radar): HideRuleSet` and `HideRulePredicate::apply(Builder $listings, HideRuleSet)` — `NOT (channel_id
     IN … OR district_id IN … OR author_id IN …)`, used by the matcher (KV-BE-107/108), the starter selector (KV-BE-102)
     and the count below.
3. `hiddenCounts(Collection<Radar>): array<int,int>` — for each radar, the number of **currently active** listings that
   match the radar's filters and are excluded only by its hide rules (legacy definition unknown, Q-API-032: spec);
   cached per radar for 60 s and flushed on `add`/`remove`/`clearAll`.
4. `DELETE /api/hidden` (KV-BE-042) leaves radar rules untouched; KV-BE-042's «Скрытое» does not list radar rules
   unless DEV-034 is approved.
5. Erasure: rules go with the radar (cascade) and are listed in the KV-BE-050 registry by KV-BE-111.

## Files

- `backend/app/Services/Radar/RadarHideRuleService.php`, `HideRulePredicate.php` (new)
- `backend/app/Domain/Radar/HideRuleSet.php`; `backend/app/Enums/Radar/HideRuleKind.php` (new)
- `backend/config/radar.php` (`author_hide_rules`, `hide_rules_user_wide`)
- `backend/tests/Feature/Radar/RadarHideRuleServiceTest.php` (new)

## API contract

n/a (service). Surfaces: `Subscription.hidden` (KV-BE-101), `PATCH {"unhide": true}` (KV-BE-104), bot buttons of
F-HIDE-004 (telegram track, `11b` M5.4/M5.6).

## Business rules

- Kept: BR-API-091, BR-BOT-063 (rule per radar, shown as `🙈 скрыто: …`, removed all together by «Показать скрытое»).
- `PROPOSED`: DEV-033 (`remove` one by one — bot), DEV-034 (user-wide scope) → `->todo()` tests.
- LB-DATA-006 and LB-BOT-025 are `decision` items fixed only through DEV-034; until then the radar scope stays.
- Spec-tested: rule target when the card has no radar (Q-BOT-028), the `hidden` count definition (Q-API-032).

## Acceptance criteria

- A listing from a hidden channel or district is never planned for delivery by that radar, and still is for the user's
  other radars without the rule.
- `hidden` equals the number of active listings that the radar's filters match and its rules exclude; it drops to 0
  after `clearAll`.
- Adding the same rule twice keeps one row.

## Tests

- `RadarHideRuleServiceTest`: `channel_rule_excludes_listing_for_that_radar_only`, `district_rule_excludes`,
  `author_rule_disabled_by_default`, `add_is_idempotent`, `hidden_count_counts_active_matches_excluded`,
  `hidden_count_cached_and_flushed_on_change`, `clear_all_removes_every_rule`,
  `rule_from_fav_card_goes_to_matching_active_radars`, `rule_from_fav_card_without_matching_radar_goes_to_all`,
  `->todo('DEV-033 PROPOSED: remove one rule')`, `->todo('DEV-034 PROPOSED: user-wide rule')`,
  `foreign_radar_rejected` (owner scope), `delete_hidden_endpoint_keeps_radar_rules` (with KV-BE-042).

## Edge cases

- A channel later opted out (KV-BE-126): rules referencing it stay harmless.
- A district rule on a radar whose filters already exclude the district → counted as 0 hidden.
- A merged listing (KV-BE-136) whose survivor belongs to another channel: rules apply to the survivor's channel; the
  alias is not re-evaluated.

## Security

- SEC-REQ-014 (rules only through the actor's radars), SEC-REQ-015 (idempotent add), SEC-REQ-011 (the bot passes ids
  decoded by its strict codec; the service re-checks ownership).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (`15` §4) for the server part of F-HIDE-004 and the
`hidden`/`unhide` part of F-RADAR-004, the `DEV` todos listed in the PR, docs and the feature rows in `09` updated, PR
reviewed by the other developer.
