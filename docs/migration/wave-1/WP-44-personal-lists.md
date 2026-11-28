# WP-44 — Personal lists, reports, surveys

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | WAITING (merged in #134; the eight migrations on the servers pending; DEC-112) |
| Depends on | WP-40 (and, by queue order, WP-42: its `ListingRefs`, `AuthorKey` and `OverlayData` are used here) |
| Size | about 2 800 changed lines, L |
| Behaviour reference | WP-13 (the shapes — unchanged here); `25` §5 (personal lists, reports and surveys); `24` §8.1 (DEC-48); `08` rows of API-011 … API-016 and API-026 … API-033; `02` BR-API-101, Q-API-064; `03` §4 (BR-APP-036, BR-APP-037, BR-APP-039, BR-APP-040, BR-APP-049, BR-APP-053, BR-APP-067); `15` §3.1 (the IDOR matrix), §3.4, §3.6; `16` SEC-REQ-014, SEC-REQ-015, SEC-REQ-045; tasks `tasks/backend/KV-BE-038-favourites.md`, `KV-BE-039-view-history.md`, `KV-BE-040-hidden-listings.md`, `KV-BE-041-blocked-authors.md`, `KV-BE-042-hidden-management.md`, `KV-BE-043-votes-reports.md`, `KV-BE-044-found-survey.md` (rules, limits, edge cases, tests — not their routes or serializers) |
| Needs from the production track | Approve the migrations on production: eight new tables (`favorites`, `hidden_listings`, `blocked_authors`, `listing_votes`, `vote_decisions`, `listing_marks`, `author_marks`, `found_answers`), all additive and empty. No env key, no nginx change |

## Goal

Favourites, view history, hidden listings, blocked authors, the «Скрытое» list, reports with weighted votes and the
«Нашли жильё?» survey are HOMI's own data. Every write is idempotent and race-safe; every per-user resource is
loaded through its owner; the listing reads of WP-42 reflect this data through the overlay. The methods answer in
the shapes of WP-13 with `meta.source = native`.

## Scope

In: the eight tables and their models; the services of `App\Services\Personal`; the real `OverlayData`; controllers
of WP-13 with real bodies; policies and the IDOR matrix test; vote weights, thresholds, the audit table and the two
kill switches; the survey.

Out: radar hide rules (WP-45 — `DELETE /hidden` does not touch them); the bot's buttons that call the same services
(WP-53); retention and erasure of these tables (WP-47 registers them; the list is at the end of "Design").

## Decisions that bind this package

- Personal data lives in HOMI from the first day and never goes to legacy (DEC-42, DEC-48).
- Every table that points at a listing stores the number and, when known, the source channel and post (`25` §5).
- Explicit target-state writes replace the legacy toggle (`25` §4.2); the bot will pass a target state too.
- One tap never relabels a person or a listing for everybody: weighted distinct voters, a threshold, an audit row
  and a kill switch (SEC-REQ-045). The threshold values are proposals until the product owner confirms them.
- A foreign identifier equals an unknown one in status, body and query count (SEC-REQ-014).
- Favourites and history are paged by 20 with a cursor, like the feed (DEC-53; the shapes are in WP-13). There is
  no switch for it and no cap on the length of the history.

## Design

### Tables

Every table has `id` (`bigIncrements` unless stated), `user_id` (foreign key, cascade on delete) and `created_at`
(`timestampTz`). "Listing columns" means `listing_number` (`unsignedBigInteger`), `source_channel` (string 64,
nullable), `source_post_id` (`unsignedBigInteger`, nullable).

| Table | Further columns | Keys |
| ----- | --------------- | ---- |
| `favorites` | listing columns | unique (`user_id`, `listing_number`); index (`user_id`, `id`) |
| `hidden_listings` | listing columns; `reason` (string 16: `manual`, `report_rented`, `report_fraud`) | unique (`user_id`, `listing_number`) |
| `blocked_authors` | `id` is a ULID; `author_key` (string 96); `kind` (`phone`, `source`); `label` (string 64); listing columns of the listing used to block | unique (`user_id`, `author_key`) |
| `listing_votes` | listing columns; `author_key` (nullable); `reason` (string 16); `detail` (string 16, nullable: a `ReportDetail` code, only with `wrong_data`); `weight` (decimal 4,2); `withdrawn_at` | unique (`user_id`, `listing_number`, `reason`); index (`listing_number`, `reason`); index (`author_key`, `reason`) |
| `vote_decisions` | no `user_id`; `subject_type` (`listing`, `author`); `subject` (string 96); `reason`; `voters` (integer); `weight_sum` (decimal 6,2); `threshold` (decimal 6,2); `outcome` (`marked`, `unmarked`) | index (`subject_type`, `subject`) |
| `listing_marks` | no `user_id`; `listing_number` (primary key); `rented_at` (WP-57 adds `taken_down_at` in its own migration) | — |
| `author_marks` | no `user_id`; `author_key` (primary key); `realtor_marked_at`; `source` (`votes`) | — |
| `found_answers` | `answer` (nullable), `trigger` (nullable), `where` (nullable), all string 16 | index (`user_id`, `id`) |

`listing_views` exists since WP-42. Models: `Favorite`, `HiddenListing`, `BlockedAuthor`, `ListingVote`,
`VoteDecision`, `ListingMark`, `AuthorMark`, `FoundAnswer`, each with a factory; `User` gains the `hasMany`
relations `favorites()`, `listingViews()`, `hiddenListings()`, `blockedAuthors()`, `listingVotes()`,
`foundAnswers()`. Enums in `App\Enums\Personal`: `HiddenReason`, `ReportReason`, `ReportDetail` (`Price = 'price'`,
`Rooms = 'rooms'`, `Place = 'place'`, `Photos = 'photos'`, `Other = 'other'`), `FoundAnswerType`, `FoundTrigger`,
`FoundPlace`.

### Resolving a listing for a write

`App\Services\Personal\ListingResolver::resolve(int $number, SourceContext $context): ListingPointer`:

1. `ListingRefs::pointer($number)` when the number is known and not gone; a merged number resolves to its survivor.
2. Otherwise `ListingSource::preview($number)`: `404` → `404 not_found`; source unavailable → `503
   source_unavailable`; found → a pointer without channel and post, and the queued job
   `App\Jobs\Listings\ResolveListingRef` (queue `default`, unique per number) reads the card, fills `listing_refs`
   and back-fills the empty source columns of the personal tables for that number.

### Services (`App\Services\Personal`)

- `FavoriteService`: `set(User, ListingPointer): bool` (`insertOrIgnore`, returns `true`), `unset(User, int):
  bool` (delete, returns `false`), `page(User, ?string $cursor, int $limit, SourceContext): ListingPage`.
- `HistoryService`: `page(…)` over `listing_views` by `last_viewed_at`; `clear(User)` deletes the user's rows, which
  also resets the `viewed` flag everywhere.
- `HiddenService`: `hide(User, ListingPointer, HiddenReason = Manual)` (`insertOrIgnore`; an existing row keeps its
  reason); `unhide(User, int)` deletes the row whatever its reason and never touches votes; `overview(User,
  SourceContext)`; `clear(User)` deletes hidden listings and blocked authors in one transaction.
- `BlockedAuthorService`: `block(User, int $number, SourceContext): BlockResult` — the author key comes from
  `listing_refs`, else from a card read (`ListingSource::details()`, which remembers it); no author → `404
  not_found`; `createOrFirst` on (`user_id`, `author_key`); a repeat returns the same entry.
  `unblockByListing(User, int)`; `removeEntry(User, string $id)`.
- `AuthorLabel`: phone → `+998 ** *** ** NN` with the last two digits only (from the number in memory, never
  stored; the form comes from `PhoneMasker` of WP-12, not from a second rule); source → `@channel`; no raw number
  available (contact variant B of WP-43) → the source's own label,
  reduced to digits, `+`, `*` and spaces. The label is stored at block time and is plain text.
- `BlockResult`: entry id, `kind`, `label`, `count` (the source's author count when the card gives one, else the
  number of listings HOMI knows), `listing_numbers` = `ListingRefs::numbersOfAuthors()` plus the listing asked for.

**List pages.** Favourites and history are paged like the feed (DEC-53, WP-13): `limit` 1 … 50, default 20,
newest first. A page is cut from HOMI's rows by keyset in the list's own order — favourites by row id, history by
`last_viewed_at` and then row id — and the cursor is `n1.` + base64url of the last row's sort key; a cursor that
does not decode ends the list quietly (empty `data`, `null` cursor). `meta.next_cursor` is `null` when no row is
left. `ListingSource::previews()` supplies the items in row order, and a number the source no longer knows is
marked gone in `listing_refs` and left out, so a page may be shorter than `limit` while the cursor is still set.
If the source is unavailable the method answers `503 source_unavailable`. `FavoriteService::page()` and
`HistoryService::page()` are the only readers of the two lists: the bot's `/fav` pages through the same method
(WP-53). `GET /hidden` returns all hidden listings (capped at 200, newest first) and all author entries in one
answer, as legacy does.

### Reports and votes (`VoteService`)

WP-53 later adds one read method for the bot's report menu, `activeReasons(User, ListingPointer): list<ReportReason>`;
nothing in this package needs it.

`report(User, ListingPointer, ReportReason, ?ReportDetail $detail): ReportOutcome`, in one transaction:

1. `insertOrIgnore` into `listing_votes`; a repeat of the same reason is counted once and returns the same outcome.
   `detail` is the code the request validated (WP-13: one of five, only with `wrong_data`; BR-APP-036, BR-API-101);
   `StoreReportRequest` turns it into the enum, and `report()` refuses a detail with another reason
   (`InvalidArgumentException`, a programming error). A repeat of `wrong_data` with another detail keeps the first
   row and its detail. The detail feeds review only: it changes neither `hidden` nor any mark (Q-API-064 is about
   legacy; HOMI decides its own effects, DEC-48).
2. `weight` from `config/votes.php`: base 1.0, plus 0.5 for Telegram Premium, 0.25 for a username, 0.25 for a
   profile photo, capped at 2.0 (proposal; the legacy formula is unknown).
3. Voter-side effect: `rented` → hide with `ReportRented`; `fraud` → hide with `ReportFraud`; both answer
   `hidden: true`. `agent` and `wrong_data` answer `hidden: false`.
4. Aggregate over votes that are not withdrawn: `rented` — sum of weights per listing number; `agent` — sum per
   author key over distinct users; on a native number also `fraud`, summed per listing number like `rented` (step 5;
   *added by the owner-cabinet plan*). Thresholds `votes.thresholds.rented` and `votes.thresholds.agent`, both 3.0
   (proposal): a single user can never reach them.
5. Crossing a threshold, once: write `listing_marks.rented_at` or `author_marks.realtor_marked_at`, and a
   `vote_decisions` row with the inputs. `wrong_data` and `fraud` have no global effect. Report votes apply to native
   listings too (*added by the owner-cabinet plan*): a native listing's author key is its owner's phone key (WP-80),
   so `agent` votes on it and on that person's legacy listings sum on one key; on a native number a crossed threshold
   — `rented`, `agent`, or `fraud` summed per listing number like `rented` (`votes.thresholds.fraud`, 3.0, read for
   native numbers only) — puts the owner listing on hold for the operators (`votes_rented`, `votes_agent`,
   `votes_fraud`) and never withdraws it on its own. WP-84 adds the event `App\Events\Personal\VoteThresholdCrossed`
   to this step and the listener.
6. `ReportOutcome` carries `agentMarked` for the `agent_marked` of WP-13: `true` for the reason `agent` when this
   vote crossed `votes.thresholds.agent`, and also when `author_marks.realtor_marked_at` was already set; `false`
   otherwise (a default of the integrator, not a decision of the developer).

`withdraw(User, ListingPointer, ReportReason)` sets `withdrawn_at` and recomputes (the bot's undo buttons, WP-53);
a recount that falls below the threshold removes the mark and writes an `unmarked` decision.

`DELETE /listings/{number}/reports` (WP-13; DEC-68) withdraws «Уже сдано» only: its controller calls
`withdraw($user, $pointer, ReportReason::Rented)` and deletes the caller's `ReportRented` hidden row. Votes with
another reason are not touched. With nothing to withdraw it still answers `204`. `withdraw` itself stays general,
for the bot's undo buttons (WP-53).

Kill switches: Pennant features `votes.rented-detector` and `votes.realtor-detector`, stored in the global scope
like the source rules of WP-10, default on. `php artisan votes:detector {rented|realtor} {on|off} --by= --reason=`
switches them. Off means: no new mark is written and existing marks are ignored by the overlay.

### Overlay data

`App\Services\Personal\EloquentOverlayData` replaces `NullOverlayData` in the container:

| Method | Query |
| ------ | ----- |
| `favorites`, `viewed` | `whereIn('listing_number', $numbers)` on the user's rows |
| `hiddenNumbers` | the user's hidden numbers |
| `blockedAuthorKeys` | the user's author keys |
| `rentedByVotes` | `listing_marks` for the given numbers, empty when the detector is off |
| `realtorAuthorKeys` | all marked keys, cached 60 s, empty when the detector is off |

The per-user sets are loaded once per request. A write of the user flushes nothing shared: the listing caches hold
no per-user data.

### Survey (`FoundSurveyService`)

`answer(User, FoundAnswerType, FoundTrigger)` inserts a row (every tap is an answer; not idempotent by design).
`where(User, FoundPlace)` fills the user's latest `elsewhere` row that has no place yet; without one it inserts a row
with only `where`. The wire value `homi` replaces the legacy `kvadro`.

### Authorisation

- Routes without an identifier (`favorites`, `history`, `hidden`, surveys, per-listing writes) act only on
  `$request->user()`; there is no parameter that names another user.
- `DELETE /hidden/authors/{id}`: `$request->user()->blockedAuthors()->findOrFail($id)` — one query for own, foreign
  and unknown; then `Gate::authorize('delete', $entry)` against `App\Policies\BlockedAuthorPolicy`.
- `backend/tests/Feature/Api/V1/IdorMatrixTest.php` holds one row per bearer route with the actors of `15` §3.1:
  owner, another user, unknown id, blocked user, no token. A coverage case walks `Route::getRoutes()` and fails when
  a bearer route has no row. The five `api.v1.media.*` routes that exist today are bearer routes too: they get rows
  that point at the media tests of WP-00, not a silent skip. WP-45 adds the radar rows.

### Tables with a user link (for the erasure registry of WP-47)

`favorites`, `listing_views`, `hidden_listings`, `blocked_authors`, `listing_votes` (delete, then recount the
affected marks), `found_answers`. `vote_decisions`, `listing_marks` and `author_marks` hold no user link.
`listing_votes.detail` is nulled after 180 days (retention registry of WP-47). An `author_marks` row of a `phone:`
key expires three years after its last mark, because WP-84's realtor check reads it (an integrator default of the
owner-cabinet plan; *added by the owner-cabinet plan*).

## Files

- Eight migrations; `backend/app/Models/{Favorite,HiddenListing,BlockedAuthor,ListingVote,VoteDecision,ListingMark,AuthorMark,FoundAnswer}.php`
  and their factories; `backend/app/Models/User.php`; `backend/app/Enums/Personal/*.php`
- `backend/app/Services/Personal/{ListingResolver,FavoriteService,HistoryService,HiddenService,BlockedAuthorService,BlockResult,AuthorLabel,VoteService,ReportOutcome,FoundSurveyService,EloquentOverlayData}.php`
- `backend/app/Jobs/Listings/ResolveListingRef.php`; `backend/app/Policies/BlockedAuthorPolicy.php`;
  `backend/app/Console/Commands/Votes/SetDetector.php`; `backend/config/votes.php`
- `backend/app/Http/Controllers/Api/V1/Personal/*.php` (real bodies; the stub bodies move into `NativeStubs`, the
  rule of WP-40); `backend/app/Providers/AppServiceProvider.php`
  (binding, Pennant definitions)
- `backend/tests/Feature/Api/V1/Personal/{FavoritesTest,HistoryTest,HiddenListingsTest,BlockedAuthorsTest,HiddenOverviewTest,ReportsTest,FoundSurveyTest}.php`,
  `backend/tests/Feature/Api/V1/IdorMatrixTest.php`, `backend/tests/Feature/Personal/{VoteThresholdTest,VoteWeightTest,AuthorLabelTest,OverlayDataTest,ListingResolverTest}.php`,
  `backend/tests/Pgsql/PersonalRaceTest.php`
- `backend/resources/fixtures/v1/{favorites,history,hidden}/*.json` (deleted where no test reads them any more);
  `docs/api/openapi.json` and generated types (expected diff: none in shapes)

## Steps

1. Read the seven task files for rules, edge cases and test names; read `.ai/agents/security-reviewer.md` (rules on
   ownership and on detectors that label people). Tests first in every step.
2. Migrations, models, factories, relations, enums (`php artisan make:model Favorite --factory --migration
   --no-interaction` and so on).
3. `ListingResolver` and `ResolveListingRef`.
4. Favourites: service, controller, list page.
5. History: list page and clear.
6. Hidden listings; blocked authors with `AuthorLabel`; the hidden overview; `DELETE /hidden`.
7. `EloquentOverlayData`; bind it; rerun the overlay tests of WP-42 against real rows.
8. Votes: weights, `VoteService`, marks, audit, kill switches and the command.
9. Survey.
10. `IdorMatrixTest` with the coverage case; the `pgsql` races.
11. Pint, PHPStan, `make ci-backend`; the security-reviewer agent reads the vote part; deploy.

## Behaviour to reproduce

- Favourite on, favourite off, list reflects the last state; the heart follows the answer (BR-APP-039).
- Both lists arrive 20 at a time. Legacy returns each list whole in one answer (BR-API-023); HOMI pages them by
  decision (DEC-53).
- Opening a listing shows it in history; clearing history needs no undo and resets the "viewed" eye (BR-APP-040,
  BR-APP-067).
- Hide is for this user only and can be undone; a second identical request changes nothing (fix of LB-API-043).
- Blocking an author hides all the author's listings for this user; the answer lists them with a masked label; the
  entry appears in «Скрытое» with its count (BR-APP-037, BR-APP-053).
- Unblocking by listing and by entry act on the same entry (fix of LB-API-040).
- `rented` hides for the voter at once and for everybody only after more confirmations; `fraud` hides for the
  reporter and can be undone through unhide, while the vote stays; every reason answers JSON (fix of LB-API-015).
- «Уже сдано» can be withdrawn by its reporter: the vote is withdrawn, the hidden row goes and the listing is back
  in the caller's feed; a repeat changes nothing (DEC-68; legacy since `index-CIa0Ldj2.js`, `08` API-055).
- A realtor vote answers `agent_marked`: `false` below the threshold, `true` at it and after it.
- `DELETE /hidden` clears hidden listings and blocked authors of the caller only; radar hide rules are untouched.

Edge cases: a favourite of a listing that is later merged shows under the survivor; an author with no listing left
is still listed with `count: 0`; a report on an already marked author is stored and marks nothing twice; a listing
without an author accepts `agent` and has no author effect.

## Tests

- Driver in these tests: the stub driver knows no author keys and no source references (WP-42). Cases that need
  them (blocked authors, vote marks per author, back-fill of channel and post) set the listing features to `legacy`
  on `LegacyFakeServer`; the others may stay on `stub`.
- Favourites: `PUT` twice → one row, `true` both times; `DELETE` twice; unknown number → `404`; source down and
  number unknown locally → `503`, known locally → `200`; list order, `favorite: true`; 45 favourites → pages of
  20, 20 and 5, each listing once, the last with `next_cursor: null`; `limit=50` → one page; a favourite added or
  removed between two pages neither repeats nor skips another row; a broken cursor → an empty page with `null`; a
  gone listing is skipped and marked, and the page is one shorter with its cursor still set; user B's `PUT` leaves
  A's rows unchanged.
- History: a full card read by A appears for A only; the same page walk in the order of the last view; a listing
  of the first page that is opened again before the second page is asked for is not repeated there; clear → empty,
  favourites untouched, `viewed` false again.
- Hidden: hide → gone from A's feed and map, still there for B; unhide restores; unhide of a `report_fraud` row keeps
  the vote; an alias number acts on the survivor.
- Blocked authors: phone author and source author; repeat → same id; label dataset (never more than two digits of a
  phone); `listing_numbers` are integers and include known listings; listing without an author → `404`; `DELETE
  /hidden/authors/{id}` own → `204`, second time → `404`, foreign id → the same `404` body and query count as an
  unknown id; a listing number passed as `{id}` → `404`.
- Overview and clear: both arrays; counts; B's data untouched by A's `DELETE /hidden`.
- Reports: four reasons → `hidden` as specified; same reason twice → one row; two reasons → two rows; `wrong_data`
  with each of the five details stores its code, without a detail stores `null`, and answers `hidden: false` in
  every case; a second `wrong_data` with another detail keeps the first; a detail with `fraud` → `422` and no row;
  below threshold no mark; at threshold one mark, one decision row; a withdrawn vote lowers the sum and removes the
  mark; a single maximum-weight user never marks; detector off → no mark and marks ignored by the overlay.
  `agent_marked`: `false` below the threshold, `true` for the vote that crosses it and for a vote on an author
  already marked, always `false` for the other reasons. `DELETE …/reports`: after a `rented` report → `204`, the
  vote has `withdrawn_at`, the `report_rented` hidden row is gone and the listing is back in the caller's feed; a
  repeat and a call without a report → `204`; an `agent` or `fraud` report of the same user is untouched; an unknown
  listing → `404`.
- Survey: 4 × 2 answers stored; `where` attaches to the caller's latest `elsewhere`, never to another user's;
  without one → a separate row.
- IDOR matrix: every row; the coverage case fails on a deliberately unlisted test route.
- `pgsql` group (`15` §3.6): 10 concurrent identical `PUT /favorites/{number}` → one row, no `500`; 10 concurrent
  blocks → one entry; one user reporting twice concurrently → one vote; distinct users voting `agent` across the
  threshold concurrently → one mark, one decision.
- Limits: the 61st list write in a minute and the 31st report in a day → `429`.

## Acceptance checklist

- [ ] All methods of this package answer in the WP-13 shapes with `meta.source = native`.
- [ ] `GET /favorites` and `GET /history` answer 20 per page with `meta.next_cursor` and end with `null`.
- [ ] Writes are idempotent; the races of the `pgsql` group pass.
- [ ] Feed, map and card of WP-42 reflect favourites, views, hidden listings, blocked authors and vote marks.
- [ ] Every personal table stores number, channel and post; unknown channel and post are back-filled by the job.
- [ ] Vote marks need the threshold, write an audit row, and both detectors can be switched off without a deploy.
- [ ] `DELETE /listings/{number}/reports` withdraws only the caller's `rented` report and its hidden row, and is
      idempotent (DEC-68); `agent_marked` is right below, at and after the threshold.
- [ ] The IDOR matrix covers every bearer route that exists at this point; foreign equals unknown.
- [ ] No phone is stored; labels are masked; `detail` holds only one of the five codes, and only for `wrong_data`.
- [ ] The PR lists the eight migrations and the tables to register for erasure.
- [ ] `make ci-backend` and the `pgsql` group are green; the security review has no open finding.
- [ ] Inside Telegram on staging, then production: favourite, hide with undo, block with undo, a «Неверные данные»
      report with each detail, and the «Скрытое» page behave as in the functional checklists of the saved and
      listing screens, and survive a relaunch.

## As built

The package is built as designed, with these points decided in the code (rule 6). Each one corrects or completes the
design above; the AM rows are in `docs/ai/reports/phase-3-notes.md` §AM, the developer's decision DEC-112 in
`docs/migration/decisions/2026-11-28-developer-answers.md`. Every weight, threshold and the `agent_marked` default are
proposals of `config/votes.php` until the product owner confirms them.

**Tables and models**

- Exactly eight migrations, `2026_11_27_200110` … `200119` (`favorites`, `hidden_listings`, `blocked_authors`,
  `listing_votes`, `vote_decisions`, `listing_marks`, `author_marks`, `found_answers`), all additive and empty.
- `listing_marks.rented_at`, `author_marks.realtor_marked_at` and `author_marks.source` are nullable: a row with no time
  is the per-subject lock of the recount (see "Votes"). `created_at` has no default; every `insertOrIgnore` sets it.
- Blocked-author ids are upper-case ULIDs (`newUniqueId()`), and `{id}` is upper-cased before the lookup.
- `user_id` is not mass-assignable on any personal model: writes go through the owner's relation or an explicit
  `insertOrIgnore` array.

**Resolving a listing**

- `ListingResolver` owns "known, not gone, survivor" (corrects step 1 of "Resolving a listing for a write"):
  `ListingRefs::pointer()` is unchanged and answers the asked number for unknown, gone and merged numbers alike; the
  resolver follows `merged_into` at most 8 hops, loop-safe (`100016` → `100001`). Its only other caller is the job.
- `ListingPointer` gains `filed` (default `true`). The back-fill job is queued by `ListingResolver::backfill()` after
  the write, not inside `resolve()` — with the tests' `sync` queue it would run before the insert. The job files nothing
  in `listing_refs` itself, so the stub driver files no rows.
- List deletes never ask the source (`unset`, `unhide`, `unblockByListing`); `DELETE …/reports` resolves the listing
  first (`404` / `503`). `unset`, `unhide`, `unhideReported` and the withdrawal act on `ListingResolver::numbersOf()`:
  the asked number and the pointer's number, their survivors in `listing_refs`, and every number of **the caller's own
  rows** in that table that `listing_refs` files as merged into one of those survivors (one query per table, the chain
  followed in PHP by `survivors()`, at most 8 hops), ascending and deduplicated — so a row stored before a later merge,
  one hop or two, leaves by the number the list shows (review C, N1, N4). `unblockByListing()` keeps the asked number
  and its survivor: a block is keyed by the author, and an entry always leaves by its id.
- **Legacy files the merge a preview answers** (corrects WP-42's "a preview files nothing"): when legacy answers another
  number for a preview (`readCard()`, `fetchPreviews()`), the merge goes into `listing_refs` like a full card's
  (`markMerged()`), nothing else (no author, no source reference). The lists read only previews, so without it a row
  listed as its survivor could not leave by that survivor until someone opened the old number's full card. The stub
  driver files nothing. An alias row it files has no survivor row yet, so `resolve()` still asks the source for a write
  through the alias (the survivor is not live in `listing_refs`): the row lands under the survivor with `filed: false`
  and the back-fill is queued, and with the source down the write answers `503` as for an unknown listing.

**Lists**

- New helpers `PersonalCursor` (`n1.` + base64url of a JSON key) and `PersonalListPager`; `ListingOverlay::items()`
  gives the flags and realtor marks of list items and never excludes one.
- **Only the source marks a listing gone** (corrects "a number the source no longer knows is marked gone in
  `listing_refs`" of "List pages"): the pager leaves out a number the previews omit but never calls `markGone()`; legacy
  marks its own definite `404`s (`rememberGone()`). Any other miss answers `503 source_unavailable` (DEC-110). On the
  stub driver a list of legacy numbers therefore loses nothing globally (review A, F1: a split rule or a rollback of
  `source.listings.card` to stub had marked every listing in every list gone).
- History pages by the composite keyset (`last_viewed_at`, `id`), the cursor carries `[unix seconds, id]`; favourites
  carry `[id]`. `PersonalCursor::decode()` checks each position against its range — a row id 1 … `PHP_INT_MAX`, a time 0
  … 253 402 300 799 (9999-12-31 23:59:59 UTC) — and a cursor outside them does not decode, so the list ends quietly
  (review A, F2: `[PHP_INT_MAX, 1]` answered `500` on both engines, `[99999999999999, 1]` on PostgreSQL).
- Favourites force `favorite: true` and take `viewed` from the overlay; history forces `viewed: true` and takes
  `favorite` from the overlay.

**Hidden listings and blocked authors**

- `ListingSource::authorPhoneLabel()` (new, both drivers) is the read that has the phone in memory: legacy reads the
  encrypted contact entry of WP-43 (`contactEntry()`), turns it into `AuthorLabel::ofPhone()` and returns only the
  masked form — no quota, no `ContactDisclosed`, no call link. The stub driver returns `null` and files no author key,
  so a block answers `404 not_found` on the stub driver until WP-48.
- `AuthorLabel` has `ofPhone()`, `phone(?masked, ?sourceLabel)` and `source()`; the fallback re-masks the source's
  label, reduced to digits, `+`, `*` and spaces, else `+998 ** *** ** **`. A channel handle keeps its digits
  (`@ijara_998901234567` is public and shown in the card's sources).
- `BlockResult.count` is the card's author count when that call read the card, else the live count, so a repeat keeps
  id, kind and label but may answer another `count` (KV-BE-041 says "same body").
- `BlockResult.listing_numbers` holds the author's **live** numbers only (neither gone nor merged): the 500 highest
  (`ListingRefs::liveNumbersOfAuthor()`; legacy and HOMI number upwards, so an author's native numbers come first),
  ascending, plus the asked number and its survivor — at most 502 (corrects "`ListingRefs::numbersOfAuthors()` plus the
  listing asked for"; review A, F4: a channel with 5 000 filed rows answered 35 KB, gone and merged numbers included).
  `count` stays uncapped; the overlay hides the rest of the author's listings. `numbersOfAuthors()` keeps its behaviour
  and its test, with no caller left in `app/`.
- `removeEntry()` takes the model; the owner lookup and `BlockedAuthorPolicy` run in `HiddenController` through
  `Gate::inspect()->authorize()` (`Gate::authorize()` would add a `403` to the OpenAPI document).
- Hidden listings sort by `id desc`, capped at 200; authors by `created_at desc, id desc`. A merged duplicate shows
  once, as its survivor. A hidden listing the source no longer knows is left out of the overview while its row stays
  (KV-BE-042 says it is listed).

**Overlay**

- `EloquentOverlayData` is bound in `SourceServiceProvider`, where WP-42 bound the null one; `NullOverlayData` is
  deleted. The realtor keys are cached 60 s as a list of strings under `personal:realtor-author-keys`, which joins
  Telescope's `SENSITIVE_KEYS`.
- Both kill switches are read before any query or cache read, so "off" takes effect at once.

**Votes**

- **The recount is serialised per subject**: inside the transaction of `report()` and `withdraw()`, the vote is written,
  then the subject's mark row is inserted with no time (`insertOrIgnore`) and locked (`lockForUpdate()`), then the tally
  runs as a new statement. `agent` takes one weight per user (`max`) per author key, so one user's votes on three
  listings of one author count once.
- **DEC-112** (corrects step 4's thresholds and adds a voter floor): `thresholds.rented` 4.0, `thresholds.agent` 4.5,
  `thresholds.fraud` 3.0 (native numbers only); `min_voters` per reason `rented` 3, `agent` 3, `fraud` 2, never below 2
  in the code (`votes.min_voters` is a map per reason, a single value applies to every reason;
  `VoteService::minVoters(ReportReason)` reads a value below 2, a missing one or a non-number as 2). Two accounts never
  mark; three bare accounts (3.0) mark nothing; the smallest crossings are `rented` 4 × 1.0 and `agent` 3 × 1.5 (a
  username and a photo each).
- **Directional recount**: a report can only mark, a withdrawal can only unmark.
- **Detector off**: votes and the voter's own hide are still written; no mark and no decision row are written, and
  `agent_marked` is `false`; a withdrawal still unmarks; votes cast while off are recounted by the subject's next
  report.
- **Native `fraud`**: its crossed state is the subject's latest `vote_decisions` row; the `listing_marks` row is only
  the lock; it writes the audit row only and has no switch. Native `rented` and `agent` mark like any listing until
  WP-84 turns them into operator holds.
- An `agent` report on a listing without a filed author files it first through a card read
  (`ListingResolver::fileAuthor()`). A repeat of any reason fills a vote's missing `author_key` from `listing_refs` and
  never overwrites a stored one, so an `agent` vote cast before the author was filed counts from its repeat on (review
  B, F5; only `agent` counts per author).
- A report after a withdrawal clears `withdrawn_at` on the first row and keeps its weight and detail.
- The realtor-keys cache is forgotten after a recount that moves an author's mark.
- `DELETE …/reports` resolves the listing (`404` / `503`) and builds one number set from the caller's `rented` votes and
  `report_rented` hidden rows (`numbersOf()` above): `withdraw($user, $pointer, Rented, $aliases)` withdraws the
  caller's votes on it in ascending order, then locks and recounts each changed subject once, ascending;
  `HiddenService::unhideReported()` deletes the caller's `report_rented` rows on the same set (review B, F3: an alias no
  card read had filed left the listing hidden; F4 and review C, N4: a vote stored before a later merge stayed live). The
  withdrawal and the deletion are two statements.
- **The switches survive a purge** (review B, F2: `pennant:purge` deleted a stored "off", the default "on" resolved and
  every mark applied again, unaudited): the default of `votes.rented-detector` and `votes.realtor-detector` is
  `VoteDetectors::defaultValue()` — the latest non-null `new_rule` of that feature in `source_flag_changes` (by `id`),
  else on. A purge row holds `NULL` and is skipped. While Pennant stores no value, the first feed request reads
  `source_flag_changes` once per detector and Pennant then stores the result. `RecordSourceFlagChange` audits the two
  vote features too: a change outside the command (a direct `activate()` / `deactivate()`, a purge or `pennant:clear`)
  writes a row with the actor `unknown` and a warning naming the feature only, for the global scope in both of Pennant's
  forms (the object and the string `__laravel_global`; review C, N2 — this also closes the gap for WP-10's source
  rules); a detector's update records the boolean Pennant resolves (`$value !== false`), so a `null` `new_rule` only
  ever means a purge or a forget (review C, N3); the command's own write is skipped through `VoteDetectors::isWriting()`
  (a singleton). Not audited: a change in the `array` store (no environment uses it), Pennant's driver `set()` and SQL
  on `features`, which fire no event. `votes:detector` is a command of its own; it writes one `source_flag_changes` row
  (feature, old and new as booleans, actor, reason, environment) and a notice with the feature, the values and
  `audit_row` only (review B, F7: it logged the `--by` and `--reason` text).

**Survey**: `where` fills the caller's latest `elsewhere` answer that has no place yet with one conditional `UPDATE`, so
two taps at once fill it once.

**Routes**: the 13 `{number}` routes of `/api/v1` (WP-12, WP-13, WP-43, WP-80 and this package) take
`ListingNumber::ROUTE_PATTERN` (`[1-9][0-9]{0,17}`) instead of `whereNumber()`, so a number beyond the integers, zero or
a leading zero is the router's `404 not_found` before any controller and before `auth:sanctum` (no token plus a bad
number answers `404`, not `401`); review A, F3: a number beyond the integers answered `500`, and with native stubs on
such numbers reached the stub bodies (`200` / `422`). Zero-led numbers used to be cast and served.
`docs/api/openapi.json` is unchanged (Scramble does not read route patterns).

**IDOR matrix**: 59 bearer routes, found by any `Authenticate` middleware (or a subclass) with `sanctum` among its
guards — `auth:sanctum`, `auth:sanctum,web`, the class-name form, `Authenticate::using()` (review B, F8: an exact string
match missed all but the first): 28 real, 26 placeholders naming the package that makes them real (radars ×6 → WP-45,
`events.store` → WP-47, `settings.card-sample` → WP-53, owner ×15 → WP-84, the contact requests ×3 → WP-85), 5 media
rows that point at named `MediaOwnershipTest` cases. Rows are compared without `source_channel` / `source_post_id`,
which the job back-fills.

**Native stubs**: while `SOURCES_NATIVE_STUBS` is on, the 16 routes of this package answer their WP-13 bodies from
`NativeStubs` (moved unchanged), the WP-13 tests run with native stubs on, and `NativeStubsTablesTest` pins that no
query touches the eight tables over the feed, the map, the card, the preview and every personal route. No fixture is
deleted.

**Reviews**: one security review per stage by a `security-reviewer` subagent, each with its own probes — stage A: 6 low,
5 info; stage B: 2 medium (two accounts mark for everybody → DEC-112; the kill switch on a purge), 2 low, 5 info — then
a narrow re-review of every fix (4 low, 2 info more). Each fix has a test that failed before it, except stage A F8 (a
doc correction); fixed: stage A F1–F4, F8, F9; stage B F1 (by DEC-112), F2–F5, F7, F8; re-review N1–N5, and the
re-review's open point on merges `listing_refs` did not know (the preview filing above). Not fixed, recorded in
"Handoff": stage A F5 (`GET /hidden`'s preview reads), F6 (per-user caps), F7 (the author key in Telescope query
entries), F10 (the cascade without a recount), F11 (the job's system context); stage B F6 (survey answers per user), F9
(the realtor-keys cache up to 60 s old); re-review N6 (the audit table as the switch's state).

## Handoff

In review (#134). The development track needs nothing more for this package after the merge.

**For the production track** (no env key, no nginx change, no `source.*` flag change; the defaults stay `stub` until
WP-48, and with `SOURCES_NATIVE_STUBS` unset the services already run on the stub driver on staging and production):

1. **Approve the eight migrations** `2026_11_27_200110` … `200119`: the new tables `favorites`, `hidden_listings`,
   `blocked_authors`, `listing_votes`, `vote_decisions`, `listing_marks`, `author_marks`, `found_answers` — all additive
   and empty; they run with the deploy (`php artisan migrate --force`), before the code serves.
2. **Queue:** `ResolveListingRef` jobs arrive on Horizon's `default` queue; the existing supervisor consumes it.
3. **The vote detectors** are Pennant features of the global scope, `votes.rented-detector` and
   `votes.realtor-detector`, on until switched: `php artisan votes:detector {rented|realtor} {on|off} --by=<who>
   --reason=<why>` (one `source_flag_changes` row each; "off" takes effect at once and ignores existing marks). A
   `pennant:purge` keeps a detector off (its default is the latest audited value), but writes an `unknown` audit row and
   a warning per detector; prefer `pennant:purge --except-registered` in a runbook. `source_flag_changes` now holds the
   switch's state: never prune or update the two features' latest rows (WP-47's retention keeps at least the latest row
   per detector) — pruned and then purged, "off" would turn back on. The table is append-only by convention, not by a
   trigger, and a write past Pennant's events (its driver's `set()`, SQL on `features`) is not audited. While Pennant
   stores no value and `source_flag_changes` cannot be read, the feed answers `500` (by design: a caught error would
   store the fallback).
4. **Until WP-48** (the stub driver serves the cards): a block answers `404 not_found` for every listing — the staging
   checklist's "block with undo" needs `source.listings.card` on `legacy`; rows written before then name stub-catalogue
   numbers.

**For the product owner** (proposals until confirmed; DEC-112 decided the voter floor and the thresholds):
- `config/votes.php`: weights 1.0 + 0.5 Premium + 0.25 username + 0.25 photo, at most 2.0; thresholds `rented` 4.0,
  `agent` 4.5, `fraud` 3.0 (native numbers only); voters `rented` 3, `agent` 3, `fraud` 2; `agent_marked` also `true` on
  an author already marked.
- The security review's further proposals for detectors that label people (rule 10): a vote counts for everybody only
  from an account at least 7 days old that opened the card; a circuit breaker that pauses marking after about 20
  automatic marks an hour; `votes:unmark {listing|author}` with an audit row as the dispute path (SEC-REQ-045); the
  contributing vote ids and weights on each `vote_decisions` row; a precision check on a labelled set before go-live.
- Per-user caps on favourites, hidden listings, blocked authors and survey answers (none today; `v1-lists` allows 60
  writes a minute).
- `where` of the survey fills the caller's latest `elsewhere` answer that has no place yet, even an older one (the
  specification's wording); "never an older one" would be a change.

**For the next packages:**
- **WP-47** registers for erasure `favorites`, `listing_views`, `hidden_listings`, `blocked_authors`, `listing_votes`
  (delete, then recount the affected marks — today the cascade of a deleted user deletes the votes without a recount, so
  a mark they crossed stays) and `found_answers`; `vote_decisions`, `listing_marks` and `author_marks` hold no user
  link. Retention: `listing_votes.detail` nulled after 180 days; `vote_decisions` and `author_marks` kept 3 years (rule
  10), the lock rows without a time included; never the vote features' rows of `source_flag_changes`.
- **WP-84**: native `rented` and `agent` crossings still mark like any listing — turn them into operator holds
  (`votes_rented`, `votes_agent`, `votes_fraud`) and add `VoteThresholdCrossed`; native `fraud` has no kill switch;
  `authorPhoneLabel()` on the native driver; legacy `previews()` drops native numbers, so owner listings fall out of the
  personal lists on that driver; the author key appears in Telescope query entries and would appear in a
  `QueryException` message (`blocked_authors`, `listing_refs`) — WP-84's placeholder-only reporting and query filter
  must cover them.
- **WP-53** calls `VoteService::withdraw()` for the bot's undo buttons and adds `activeReasons()`: both must read the
  caller's votes over the same number set as `DELETE …/reports` (the asked number, its survivors and the caller's own
  rows merged into them), or a card that shows «Сдано» after a merge cannot be undone.
- **WP-45** replaces the six radar placeholder rows of `IdorMatrixTest`; WP-47, WP-53, WP-84 and WP-85 theirs.
- Open, no package yet: `GET /hidden` reads up to 200 previews per cold locale or currency (page it, or a tighter
  limiter); a block that reads the card passes legacy's daily limit on as `429` with `reason: daily`;
  `ResolveListingRef` reads in the system context, so under a per-user rollout it uses the feature's default driver;
  votes are not re-pointed after a merge or a stronger author key; an `agent` report on a listing without a filed author
  answers `503` while the source is down; the realtor-keys cache may hold an old list for up to 60 s after an unmark
  (the designed TTL); SEC-REQ-048's vote-burst counter is not built; `SourceRuleStore` (WP-10) logs the `--by` /
  `--reason` text of `sources:set`.
