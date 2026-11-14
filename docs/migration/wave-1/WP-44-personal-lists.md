# WP-44 — Personal lists, reports, surveys

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-40 (and, by queue order, WP-42: its `ListingRefs`, `AuthorKey` and `OverlayData` are used here) |
| Size | about 2 800 changed lines, L |
| Behaviour reference | WP-13 (the shapes — unchanged here); `25` §5 (personal lists, reports and surveys); `24` §8.1 (DEC-48); `08` rows of API-011 … API-016 and API-026 … API-033; `03` §4 (BR-APP-036, BR-APP-037, BR-APP-039, BR-APP-040, BR-APP-049, BR-APP-053, BR-APP-067); `15` §3.1 (the IDOR matrix), §3.4, §3.6; `16` SEC-REQ-014, SEC-REQ-015, SEC-REQ-045; tasks `tasks/backend/KV-BE-038-favourites.md`, `KV-BE-039-view-history.md`, `KV-BE-040-hidden-listings.md`, `KV-BE-041-blocked-authors.md`, `KV-BE-042-hidden-management.md`, `KV-BE-043-votes-reports.md`, `KV-BE-044-found-survey.md` (rules, limits, edge cases, tests — not their routes or serializers) |
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
| `listing_votes` | listing columns; `author_key` (nullable); `reason` (string 16); `detail` (string 500, nullable); `weight` (decimal 4,2); `withdrawn_at` | unique (`user_id`, `listing_number`, `reason`); index (`listing_number`, `reason`); index (`author_key`, `reason`) |
| `vote_decisions` | no `user_id`; `subject_type` (`listing`, `author`); `subject` (string 96); `reason`; `voters` (integer); `weight_sum` (decimal 6,2); `threshold` (decimal 6,2); `outcome` (`marked`, `unmarked`) | index (`subject_type`, `subject`) |
| `listing_marks` | no `user_id`; `listing_number` (primary key); `rented_at` (WP-57 adds `taken_down_at` in its own migration) | — |
| `author_marks` | no `user_id`; `author_key` (primary key); `realtor_marked_at`; `source` (`votes`) | — |
| `found_answers` | `answer` (nullable), `trigger` (nullable), `where` (nullable), all string 16 | index (`user_id`, `id`) |

`listing_views` exists since WP-42. Models: `Favorite`, `HiddenListing`, `BlockedAuthor`, `ListingVote`,
`VoteDecision`, `ListingMark`, `AuthorMark`, `FoundAnswer`, each with a factory; `User` gains the `hasMany`
relations `favorites()`, `listingViews()`, `hiddenListings()`, `blockedAuthors()`, `listingVotes()`,
`foundAnswers()`. Enums in `App\Enums\Personal`: `HiddenReason`, `ReportReason`, `FoundAnswerType`, `FoundTrigger`,
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
  stored); source → `@channel`; no raw number available (contact variant B of WP-43) → the source's own label,
  reduced to digits, `+`, `*` and spaces. The label is stored at block time and is plain text.
- `BlockResult`: entry id, `kind`, `label`, `count` (the source's author count when the card gives one, else the
  number of listings HOMI knows), `listing_numbers` = `ListingRefs::numbersOfAuthors()` plus the listing asked for.

**List pages.** By default favourites and history come back whole, newest first, with `meta.next_cursor: null`, and
`cursor` and `limit` are ignored (`25` §4.1, WP-13: paging them is DEV-003, which is off). The switch is
`config('personal.paginate_lists')` (new `backend/config/personal.php`, default `false`). Only with it on: a page is
cut from HOMI's rows by keyset (`n1.<last row id>`, newest first) and may be shorter than `limit` while
`meta.next_cursor` is still set. In both cases `ListingSource::previews()` supplies the items in row order, and a
number the source no longer knows is marked gone in `listing_refs` and left out. If
the source is unavailable the method answers `503 source_unavailable`. `GET /hidden` returns all hidden listings
(capped at 200, newest first) and all author entries in one answer, as legacy does.

### Reports and votes (`VoteService`)

WP-53 later adds one read method for the bot's report menu, `activeReasons(User, ListingPointer): list<ReportReason>`;
nothing in this package needs it.

`report(User, ListingPointer, ReportReason, ?string $detail): ReportOutcome`, in one transaction:

1. `insertOrIgnore` into `listing_votes`; a repeat of the same reason is counted once and returns the same outcome.
   `detail` is trimmed, stripped of control characters, cut to 500 characters, never logged.
2. `weight` from `config/votes.php`: base 1.0, plus 0.5 for Telegram Premium, 0.25 for a username, 0.25 for a
   profile photo, capped at 2.0 (proposal; the legacy formula is unknown).
3. Voter-side effect: `rented` → hide with `ReportRented`; `fraud` → hide with `ReportFraud`; both answer
   `hidden: true`. `agent` and `wrong_data` answer `hidden: false`.
4. Aggregate over votes that are not withdrawn: `rented` — sum of weights per listing number; `agent` — sum per
   author key over distinct users. Thresholds `votes.thresholds.rented` and `votes.thresholds.agent`, both 3.0
   (proposal): a single user can never reach them.
5. Crossing a threshold, once: write `listing_marks.rented_at` or `author_marks.realtor_marked_at`, and a
   `vote_decisions` row with the inputs. `wrong_data` and `fraud` have no global effect.

`withdraw(User, ListingPointer, ReportReason)` sets `withdrawn_at` and recomputes (the bot's undo buttons, WP-53);
a recount that falls below the threshold removes the mark and writes an `unmarked` decision.

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
`listing_votes.detail` is nulled after 180 days (retention registry of WP-47).

## Files

- Eight migrations; `backend/app/Models/{Favorite,HiddenListing,BlockedAuthor,ListingVote,VoteDecision,ListingMark,AuthorMark,FoundAnswer}.php`
  and their factories; `backend/app/Models/User.php`; `backend/app/Enums/Personal/*.php`
- `backend/app/Services/Personal/{ListingResolver,FavoriteService,HistoryService,HiddenService,BlockedAuthorService,BlockResult,AuthorLabel,VoteService,ReportOutcome,FoundSurveyService,EloquentOverlayData}.php`
- `backend/app/Jobs/Listings/ResolveListingRef.php`; `backend/app/Policies/BlockedAuthorPolicy.php`;
  `backend/app/Console/Commands/Votes/SetDetector.php`; `backend/config/{votes,personal}.php`
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
- Opening a listing shows it in history; clearing history needs no undo and resets the "viewed" eye (BR-APP-040,
  BR-APP-067).
- Hide is for this user only and can be undone; a second identical request changes nothing (fix of LB-API-043).
- Blocking an author hides all the author's listings for this user; the answer lists them with a masked label; the
  entry appears in «Скрытое» with its count (BR-APP-037, BR-APP-053).
- Unblocking by listing and by entry act on the same entry (fix of LB-API-040).
- `rented` hides for the voter at once and for everybody only after more confirmations; `fraud` hides for the
  reporter and can be undone through unhide, while the vote stays; every reason answers JSON (fix of LB-API-015).
- `DELETE /hidden` clears hidden listings and blocked authors of the caller only; radar hide rules are untouched.

Edge cases: a favourite of a listing that is later merged shows under the survivor; an author with no listing left
is still listed with `count: 0`; a report on an already marked author is stored and marks nothing twice; a listing
without an author accepts `agent` and has no author effect.

## Tests

- Driver in these tests: the stub driver knows no author keys and no source references (WP-42). Cases that need
  them (blocked authors, vote marks per author, back-fill of channel and post) set the listing features to `legacy`
  on `LegacyFakeServer`; the others may stay on `stub`.
- Favourites: `PUT` twice → one row, `true` both times; `DELETE` twice; unknown number → `404`; source down and
  number unknown locally → `503`, known locally → `200`; list order, `favorite: true`, the whole list with
  `next_cursor: null` by default and a cursor walk with `personal.paginate_lists` on; a gone listing is skipped and
  marked; user B's `PUT` leaves A's rows unchanged.
- History: a full card read by A appears for A only; clear → empty, favourites untouched, `viewed` false again.
- Hidden: hide → gone from A's feed and map, still there for B; unhide restores; unhide of a `report_fraud` row keeps
  the vote; an alias number acts on the survivor.
- Blocked authors: phone author and source author; repeat → same id; label dataset (never more than two digits of a
  phone); `listing_numbers` are integers and include known listings; listing without an author → `404`; `DELETE
  /hidden/authors/{id}` own → `204`, second time → `404`, foreign id → the same `404` body and query count as an
  unknown id; a listing number passed as `{id}` → `404`.
- Overview and clear: both arrays; counts; B's data untouched by A's `DELETE /hidden`.
- Reports: four reasons → `hidden` as specified; same reason twice → one row; two reasons → two rows; `detail`
  stored trimmed and absent from logs; below threshold no mark; at threshold one mark, one decision row; a withdrawn
  vote lowers the sum and removes the mark; a single maximum-weight user never marks; detector off → no mark and
  marks ignored by the overlay.
- Survey: 4 × 2 answers stored; `where` attaches to the caller's latest `elsewhere`, never to another user's;
  without one → a separate row.
- IDOR matrix: every row; the coverage case fails on a deliberately unlisted test route.
- `pgsql` group (`15` §3.6): 10 concurrent identical `PUT /favorites/{number}` → one row, no `500`; 10 concurrent
  blocks → one entry; one user reporting twice concurrently → one vote; distinct users voting `agent` across the
  threshold concurrently → one mark, one decision.
- Limits: the 61st list write in a minute and the 31st report in a day → `429`.

## Acceptance checklist

- [ ] All methods of this package answer in the WP-13 shapes with `meta.source = native`.
- [ ] Writes are idempotent; the races of the `pgsql` group pass.
- [ ] Feed, map and card of WP-42 reflect favourites, views, hidden listings, blocked authors and vote marks.
- [ ] Every personal table stores number, channel and post; unknown channel and post are back-filled by the job.
- [ ] Vote marks need the threshold, write an audit row, and both detectors can be switched off without a deploy.
- [ ] The IDOR matrix covers every bearer route that exists at this point; foreign equals unknown.
- [ ] No phone is stored; labels are masked; `detail` never appears in a log.
- [ ] The PR lists the eight migrations and the tables to register for erasure.
- [ ] `make ci-backend` and the `pgsql` group are green; the security review has no open finding.
- [ ] Inside Telegram on staging, then production: favourite, hide with undo, block with undo, a report with a
      detail text, and the «Скрытое» page behave as in the functional checklists of the saved and listing screens,
      and survive a relaunch.

## Handoff

Empty.
