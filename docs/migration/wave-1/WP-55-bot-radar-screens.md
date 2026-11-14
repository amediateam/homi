# WP-55 — Free text and voice, poll, radar list and card, edit

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-54 |
| Size | about 4 000 changed lines, L. Above the 3 000-line guide: two PRs. Part A = steps 1–9 (`/subs`, radar card, pause, mode, hidden rules, delete, poll, edit). Part B = steps 10–17 (LLM gateway, free text, voice). Production works after either part: until part B, free text keeps the reply of WP-52 |
| Behaviour reference | `04` §2 (rows BOT-015, BOT-054 … BOT-056, BOT-063 … BOT-071), §3.9, §3.11, §3.12, §4.1 (BTN-049 … BTN-065), §4.2, §4.3, §8 (BR-BOT-051 … BR-BOT-055, BR-BOT-063 … BR-BOT-071, BR-BOT-088), §9 (LB-BOT-017, LB-BOT-020, LB-BOT-021, LB-BOT-024); `09` §4.2; `11b` §2.3 row 4; `16` (SEC-REQ-042 … SEC-REQ-044); task files KV-TG-038 … KV-TG-044 and KV-BE-047; rules of KV-BE-044, KV-BE-100, KV-BE-104, KV-BE-106 |
| Needs from the production track | (1) Approval of one migration: table `llm_calls`. (2) The shared-file PR that adds the queue `llm` with `supervisor-llm` to `backend/config/horizon.php` is reviewed by the production track; after its deploy, a Horizon restart. (3) In the server env of staging and of production, whenever the team chooses or changes a provider (DEC-55; no deploy is needed): `AI_DEFAULT_PROVIDER` and `AI_TEXT_MODEL`; optionally `AI_TRANSCRIPTION_PROVIDER` and `AI_TRANSCRIPTION_MODEL`; the API key of each chosen provider under the name the published `config/ai.php` gives it; `AI_DAILY_SPEND_LIMIT`, `AI_REQUEST_TIMEOUT`; `BRAND_LLM_VENDOR` (the name the privacy text shows, WP-56); then a Horizon restart, because the queue workers read the env only at start. (4) Once a provider is configured and its benchmark was read: `php artisan llm:feature query-parsing on` on staging, then on production. While no provider is configured, or the feature is off, free text and voice get the not-understood reply, which points to the wizard. (5) `RADAR_CREATION_ENABLED` is not set by this package (WP-57, DEC-51): until then `/subs`, free text and voice answer the "soon" text on the servers |

## Goal

The user manages radars in the chat as in the legacy bot: `/subs` lists them, a radar card pauses, resumes, changes
the delivery mode, clears hidden rules, deletes and edits a radar, and the «Нашли жильё?» poll follows a pause or a
delete. A typed or spoken description of housing becomes a ready review through an LLM parser that never sees a phone
number or a handle and never stores the message. Which language model does the parsing is configuration: the team
switches providers on the servers without a code change.

## Scope

In:

- `/subs`: the empty state, the list, the radar title, the radar card with its status and its buttons.
- Pause, resume with the unseen matches, delivery mode, «Показать скрытое», delete with confirmation.
- The poll «Нашли жильё?» with the «Где нашли?» step and its replies.
- Editing an existing radar: the entry from the card, the screen «Радар — что изменить?», the save and the cancel.
- The LLM gateway (masking, structured output, spend cap, kill switch, call log), the query parser, free-text
  queries, voice queries; the benchmark command that compares providers on the golden set.
- Removing `subs` from `config('bot.interim_commands')`; replacing the interim registration of the action `sb` (set
  by WP-54) and the interim text reply of WP-52.

Out:

- The wizard engine, its steps, the review screen, `SaveRadar` for a new radar, the starter list sender — WP-54.
  This package adds the review title for free text, the notes block, and the `edit_radar` entry and save.
- «Скрыть похожие» on a listing card (creates the rules shown here) — WP-53.
- Radar storage, limits, `ask_found`, hide rules, starter selection — WP-45. The survey storage — WP-44.
- Translation of listings stays on the legacy driver (WP-43); it does not use the gateway built here.
- Quiet hours, digest times and the service-news option of `/settings` — WP-56. Sending digests — WP-57.

## Decisions that bind this package

| # | Decision | Consequence here |
| - | -------- | ---------------- |
| 1 | DEC-43, `25` §6 | All 13 handlers, 17 buttons and 21 texts of the lists below are built |
| 2 | DEC-36 and answer 5 of the developer | The four items of `04` §9.2 in scope are design decisions whose fix is a `DEV` row: LB-BOT-017 (DEV-028), LB-BOT-020 (DEV-030), LB-BOT-021 (DEV-031), LB-BOT-024 (DEV-033). Each is built behind `bot.devNNN`, off; the legacy behaviour is the default |
| 3 | DEC-40 — brand | The poll text and its first button name the product; both take `:brand`. The stored answer code is `homi` (WP-13), not the legacy `kvadro` |
| 4 | WP-13 — radar contract | Pause, resume, mode, unhide, update and delete go through the radar service of WP-45, the same calls as `PATCH`, `PUT` and `DELETE /api/v1/radars/{id}`. `PUT` keeps `active`; the outcome kinds and `ask_found` are read from the service |
| 5 | `25` §5 "Reports and surveys", DEC-48 | Poll answers are stored by `FoundSurveyService` of WP-44 in `found_answers`, HOMI only |
| 6 | DEC-55 — no fixed vendor; the team switches (answers DEC-03) | No vendor-specific code: the gateway calls `laravel/ai` only, and provider and model for parsing and for transcription come from `config/ai.php`, whose values come from env. Every provider the package supports can be selected on the servers without a code change. While no provider is configured, free text and voice get the not-understood reply (TXT-BOT-043, which points to the wizard) — never an error. The privacy text of WP-56 names the providers that are configured |
| 7 | `25` §2 rule 7, SEC-REQ-047 | The message text, the audio and the transcript are never written to a table, a log, a cache key or a failed-job payload |
| 8 | DEC-49, `docs/handoff/parallel-work.md` §4 | No new package: `laravel/ai` is installed |
| 9 | DEC-45, DEC-46, `25` §9 | One PR per part; the checklist is run in ru, uz and en on staging and production |
| 10 | DEC-51 — radars before delivery | Built and tested with `config('radar.creation_enabled')` on. The registrations of `subs`, `sb`, the text handler and the voice handler carry the `radar` mark of WP-51: while the switch is off — staging and production until WP-57 — they answer `bot.radar.soon`, and no phrase reaches a language model |
| 11 | DEC-54 — the whole-city label | The summary rows of WP-54 shown on the radar card, the edit screen and the free-text review read `<Город> целиком`. Nothing here builds the label itself |

## Design

The specification of the named package is authoritative for names. If it differs, use its name and do not create a
second service.

### What comes from where

| Need | Package | Call expected |
| ---- | ------- | ------------- |
| The user's radars in creation order, with filters, `active`, `mode`, the hide rules | WP-45 | `$user->radars()` in creation order; one radar by its ULID through the same relation (the ULID is the callback key, WP-51) |
| Pause, resume, mode | WP-45 | `RadarService::setActive(User, Radar, bool)` → `RadarMutation` of kind `paused` or `resumed` (the `Starter` of a resume holds the unseen numbers); `setMode(User, Radar, RadarMode)`; whether to ask the poll: `FoundAskPolicy::shouldAsk(User, 'pause' or 'delete')`, called once per pause or delete |
| Clear hide rules | WP-45 | `RadarHideRuleService::clearAll(Radar)`; `rulesFor(Radar)` for the `🙈` line. Removing one rule (DEV-033) has no method in WP-45: this package adds `removeOne(Radar, int $ruleId)` with the flagged branch |
| Replace filters | WP-45 | `RadarService::update(User, Radar, SearchFilters, null)` → `RadarMutation` of kind `updated` with its `Starter`; throws `RadarDuplicate` |
| Delete | WP-45 | `RadarService::delete(User, Radar)`, then `FoundAskPolicy::shouldAsk()` |
| Radar limit | WP-45 | `config('radar.max')` through `WizardReference::radarLimit()` of WP-54 |
| Store a poll answer | WP-44 | `FoundSurveyService::answer(User, FoundAnswerType, FoundTrigger)`, `where(User, FoundPlace)` |
| Summary rows, wizard engine, review, starter list | WP-54 | `RadarSummaryRenderer`, `Wizard` in mode `edit_radar`, `ReviewStep`, the job `SendStarterList`, `BotRadarWrite::run()` around every call of the radar service |
| Radar title | WP-53 | `App\Telegram\Rendering\RadarTitle`, created there for the hide-rule radar choice; this package extends that class (the 60-character cut, the tests) |
| Voice file | WP-50 | `TelegramBot::getFile()` and `downloadFile()`; the file address is never built outside the client (SEC-REQ-013) |
| Text and voice redaction in `telegram_updates` | WP-50 | the ledger keeps no `text` and no `voice` after processing |
| Per-user limits | WP-51 | the router's limiter and its buckets `free_text_per_hour`, `voice_per_hour` |

### Radar screens

| Class | Role |
| ----- | ---- |
| `App\Telegram\Handlers\SubsCommand` | command `subs` (new message) and `k1:sb:0:ls` (edits the pressed message into the list); `k1:sb:<r>:op` (the card) |
| `App\Telegram\Rendering\RadarTitle` | `for(SearchFilters, BotLocale): string` — the format of TXT-BOT-059, cut to 60 characters with `…` for buttons |
| `App\Telegram\Rendering\RadarCardRenderer` | text of TXT-BOT-060: title, status line, summary rows, the `🙈` line |
| `App\Telegram\Keyboards\{RadarListKeyboard,RadarCardKeyboard,HiddenRulesKeyboard,ConfirmKeyboard,FoundPollKeyboard}` | layouts below |
| `App\Telegram\Handlers\Subs\RadarStateActions` | `ps`, `on`, `dg`, `in` |
| `App\Telegram\Handlers\Subs\RadarHiddenRules` | `ra` (and `hr`, `rr:<rule>`, `ray` behind `bot.dev033`) |
| `App\Telegram\Handlers\Subs\RadarDelete` | `dl`, `dly`, `dln` |
| `App\Telegram\Handlers\Subs\RadarEdit` | `ed` — seeds the wizard of WP-54 in mode `edit_radar`; provides the edit screen and the edit save |
| `App\Telegram\Handlers\FoundPoll` | `maybeSend(User, FoundTrigger, bool $askFound)`; action `fp` |

Callback data, action `sb`: `k1:sb:0:ls`, and `k1:sb:<radar key>:<op>` with `op` ∈ `op`, `ps`, `on`, `dg`, `in`,
`ra`, `ed`, `dl`, `dly`, `dln`, plus `hr`, `rr:<rule>`, `ray` for DEV-033. The radar is always found through the
actor's relation; an unknown or foreign key is outdated-button behaviour (SEC-REQ-014).

Action `fp`: `k1:fp:<p or d>:<hm, el, se or st>` and `k1:fp:w:<tg, ol, si, ag, fr, st or ot>`. `found_answers` has
no radar column (WP-44), so the data carries the trigger only. The registry table of WP-51 and
`docs/infrastructure/telegram-webhook.md` carry the same shape.

Every view is rendered from the server state at press time, so an old list or card shows the current state after
any press. A press whose target state already holds answers with the same toast and re-renders; nothing is written
twice (SEC-REQ-015).

Edit of an existing radar:

- `ed` → `ConversationStore::begin(WizardEdit, messageId, data, editRadar: <radar key>)` with `data.filters` = all
  25 keys of the radar, `mode = edit_radar`, `returnTo = edit_screen`. The card message becomes the edit screen.
- The edit screen is a step of this package registered in the step graph of WP-54 under the key `edit_screen`:
  title TXT-BOT-033, summary rows, the `✏️` buttons of the branch, `✅ Сохранить` (`k1:wz:<sid>:sv`), `✖️ Отмена`
  (`k1:wz:<sid>:cx`).
- Keys the wizard cannot show (`price_min`, `polygon`, `furnished`, `renovation`, floors, area, `market`,
  `appliances`, …) stay in the draft untouched and are saved back byte-equal (Q-BOT-026, closed by specification).
- Save in `edit_radar` mode is handled by `RadarEdit::save()`, called by `SaveRadar` of WP-54 when the conversation
  kind is `WizardEdit`. After the message is edited it dispatches the job `SendStarterList` of WP-54 with the
  starter numbers of the mutation (listings not delivered before), without sticker and without tip.

### LLM gateway and query parser

`App\Services\Parsing\`:

| Class | Role |
| ----- | ---- |
| `PiiMasker` | `mask(string): MaskedText`. Replaces, in this order: `t.me/…` and `telegram.me/…` links, `@handles`, e-mails, Uzbek phones in every common local form, other international numbers, 13–19-digit card-like sequences. The phone forms are those of `PhoneMasker` of WP-12 — one list in the code base, used here with placeholders instead of the masked form. Placeholders `⟦PHONE_1⟧`, `⟦HANDLE_1⟧`, …; the same value gets the same placeholder. Zero-width characters are removed before matching. The map lives in memory only |
| `LlmGateway` | The only class that calls `laravel/ai` (arch test). `complete(LlmTask, string $untrusted, array $schema): LlmResult` and `transcribe(LlmTask, string $bytes, string $mime): string`. Masks, wraps the text in delimiters with the instruction that it is data, calls the provider and model that `config/ai.php` names for the task — never a name written in code — with the timeout `ai.request_timeout` (default 10 s), validates the JSON output against the schema (enums, ranges, lengths), strips links, phones and handles from free-text output, records tokens and cost |
| `QueryParser` | `parse(string $text, string $locale): ParsedQuery`. Prompt version `query.v1`; output schema = a partial filter object (deal, types, rooms, city, districts, zones, `near_metro`, `price_max`, `below_median`, owner, tenant, pets) plus `unknown_places[]`. The output is passed through `SearchFiltersNormaliser` (WP-12) and the reference codes (`WizardReference` of WP-54); fields that fail are dropped |
| `ParsedQuery` | `filters` (partial), `dealDefaulted`, `unknownPlaces`, `understood` (true when at least one of deal, object, place, rooms, budget was recognised) |
| `MaskedText`, `LlmTask`, `LlmResult` | value objects |

- Exceptions `App\Exceptions\Parsing\{LlmUnavailable,LlmInvalidOutput}`. `LlmUnavailable` covers: no provider
  configured (thrown before any call), feature off, cap reached, timeout, provider error.
- Feature `App\Features\LlmQueryParsing` (Pennant, global scope, default off). `php artisan llm:feature
  query-parsing on|off|status` writes it with `Feature::globally()`; confirm the calls with `search-docs`.
- Spend: the cost of every call is added to the cache key `llm:spend:<UTC date>` (`Cache::increment`: Redis on the
  servers, the `array` store in tests — CI has no Redis service) and to the call log. At
  `AI_DAILY_SPEND_LIMIT` the gateway throws `LlmUnavailable` until the next UTC day (SEC-REQ-044).
- Table `llm_calls`: `id` (ULID), `task` (string 32), `prompt_version` (string 16), `provider`, `model` (string
  64), `masked_input_sha256` (char 64), `input_tokens`, `output_tokens` (integers), `cost_micro_usd` (bigint),
  `status` (string 16: `ok`, `invalid_output`, `unavailable`), `error_code` (string 32, nullable), `created_at`.
  No text column of any kind. Model `LlmCall` with a factory; an entry in `config/retention.php` of WP-47 deletes
  rows after 180 days. The table has no user link, so the erasure registry lists it as exempt.
- Config `backend/config/ai.php` (the file does not exist yet; publish it with `php artisan vendor:publish
  --tag=ai-config`, config only). The package file hard-codes `'default' => 'openai'` and a separate
  `'default_for_transcription' => 'openai'`. Change both so that the repository chooses no vendor (DEC-55):
  `'default' => env('AI_DEFAULT_PROVIDER')` and `'default_for_transcription' => env('AI_TRANSCRIPTION_PROVIDER',
  env('AI_DEFAULT_PROVIDER'))`, without a fallback name; the other `default_for_…` keys belong to operations HOMI
  does not use and stay as published. Add `text_model` (`AI_TEXT_MODEL`), `transcription_model`
  (`AI_TRANSCRIPTION_MODEL`), `daily_spend_limit`, `request_timeout`, and `pricing` — micro-USD per thousand input
  and output tokens and per audio minute, keyed by provider and model, with a `default` entry, so that the spend
  cap keeps working after a switch. The `providers` list stays as published: every provider the package supports
  can be selected by its name and its key.
- "Not configured" means: an empty provider name, an empty model, or an empty key of the named provider. The
  gateway then throws `LlmUnavailable` with the reason `not_configured`, logs one `info` line and calls nothing. A
  provider that does not offer an operation (transcription, for example) fails like any provider error.
- The gateway passes provider, model and timeout with each call. The installed package takes them as arguments of
  `prompt()` and of the transcription's `generate()`, and has `timeout()` on the pending transcription
  (`backend/vendor/laravel/ai/src/Promptable.php`, `src/PendingResponses/PendingTranscriptionGeneration.php`); how
  the fakes are installed: verify in the installed documentation of `laravel/ai` before writing it.
- Env names go to `backend/.env.example` in a separate small PR (shared file) — `AI_DEFAULT_PROVIDER`,
  `AI_TEXT_MODEL`, `AI_TRANSCRIPTION_PROVIDER`, `AI_TRANSCRIPTION_MODEL`, `AI_DAILY_SPEND_LIMIT`,
  `AI_REQUEST_TIMEOUT`, all blank, and no provider key — and to `docs/infrastructure/environments.md`, which also
  says that a provider's key is added to the server env under the name the published file gives it.
- `php artisan llm:benchmark query-parsing {--provider=} {--model=}` (`App\Console\Commands\Llm\BenchmarkCommand`)
  runs the golden set — `resources/fixtures/llm/phrases.json`, synthetic phrases with their expected filters —
  through `QueryParser` against the named provider and model, or the configured ones, and prints per phrase pass
  or fail and in total: the share of phrases with the expected filters, the share understood, tokens, cost, the
  median and the slowest latency. It calls through the gateway, so masking, the cap and the call log apply (task
  `benchmark`), and it needs that provider's key. The team runs it on staging for each candidate before it
  changes `AI_DEFAULT_PROVIDER`.
- Queue `llm`, supervisor `supervisor-llm` (one process locally, two on servers, timeout 60 s, tries 1): shared
  file `config/horizon.php`, separate small PR.

Jobs `App\Jobs\Telegram\{ParseUserQuery,TranscribeVoiceQuery}` on `llm`, `tries = 1`, payload encrypted
(`ShouldBeEncrypted`), `$deleteWhenMissingModels`, and `failed()` removes nothing from disk because nothing was
written. The job carries chat id, message id, locale and the text; the voice job carries the `file_id` and downloads
the bytes into memory inside `handle()`.

Handlers `App\Telegram\Handlers\{FreeTextQuery,VoiceQuery}`: registered as the text handler and the voice handler of
the router of WP-51 (the `messageFallback` slot WP-52 used for its interim reply keeps every other message kind).

Limits: the two buckets the router of WP-51 already has — `bot.limits.free_text_per_hour` = 30 and
`bot.limits.voice_per_hour` = 10; no second pair of keys is added. Over the limit → `bot.common.slow_down` once
per window, no job. Voice:
`voice.max_seconds` = 60, `voice.max_bytes` = 1 048 576 (Q-BOT-005, closed by specification).

### Configuration

`backend/config/bot.php`, added keys: `dev028`, `dev030`, `dev031`, `dev033` (all `false`); `voice.*` above;
`freetext.fallback_city` = `tashkent`.

New catalogue keys (ru, uz, en; legacy has no such texts): `subs.resumed_found`, `subs.hidden_rules`,
`subs.rule_removed`, `subs.unhide_all_confirm`, `radar.updated`, `radar.updated_paused`,
`freetext.unsupported_city`, `voice.too_long`. `found.searching` and `found.stopped` are not new: WP-51 keyed them
as the drafts of TXT-BOT-071, and this package finalises their wording.

## Files

All paths under `backend/`.

- `app/Telegram/Handlers/{SubsCommand,FoundPoll,FreeTextQuery,VoiceQuery}.php`
- `app/Telegram/Handlers/Subs/{RadarStateActions,RadarHiddenRules,RadarDelete,RadarEdit}.php`
- `app/Telegram/Rendering/RadarCardRenderer.php` (new); `RadarTitle.php` of WP-53 and
  `app/Services/Radar/RadarHideRuleService.php` of WP-45 (`removeOne()`, used only with `bot.dev033`) are changed
- `app/Telegram/Keyboards/{RadarListKeyboard,RadarCardKeyboard,HiddenRulesKeyboard,ConfirmKeyboard,FoundPollKeyboard}.php`
- `app/Telegram/Conversations/RadarWizard/{EditScreenStep}.php` (new); `ReviewStep.php`, `WizardState.php`,
  `SaveRadar.php` (changed: title by origin, notes block, the edit branch)
- `app/Services/Parsing/{PiiMasker,MaskedText,LlmGateway,LlmTask,LlmResult,QueryParser,ParsedQuery}.php`
- `app/Exceptions/Parsing/{LlmUnavailable,LlmInvalidOutput}.php`, `app/Features/LlmQueryParsing.php`
- `app/Jobs/Telegram/{ParseUserQuery,TranscribeVoiceQuery}.php`
- `app/Console/Commands/Llm/{FeatureCommand,BenchmarkCommand}.php` (`llm:feature`, `llm:benchmark`)
- `app/Models/LlmCall.php`, `database/factories/LlmCallFactory.php`,
  `database/migrations/<date>_create_llm_calls_table.php`
- `config/ai.php` (published; providers and models from env, no vendor default), `config/bot.php`,
  `lang/{ru,uz,en}/bot.php`
- `app/Providers/TelegramServiceProvider.php` (command `subs`; actions `sb`, `fp`; text and voice handlers; `subs`,
  `sb`, text and voice with `radar: true`, the mark of WP-51)
- Shared files, each in its own small PR: `config/horizon.php` (`llm`), `.env.example` (`AI_*`)
- `tests/Unit/Parsing/PiiMaskerTest.php`, `tests/Fixtures/Pii/masking-corpus.json` (synthetic values only),
  `tests/Feature/Parsing/{LlmGatewayTest,QueryParserTest,LlmBenchmarkTest}.php`, `tests/Arch/LlmBoundaryTest.php`
- `tests/Unit/Telegram/RadarTitleTest.php`
- `tests/Feature/Bot/{SubsCommandTest,RadarPauseResumeModeTest,RadarHiddenRulesDeleteTest,RadarEditTest,FoundPollTest,FreeTextQueryTest,VoiceQueryTest}.php`
- `resources/fixtures/llm/phrases.json` (the golden set; read by `QueryParserTest` and by `llm:benchmark`),
  `tests/Fixtures/Bot/transcripts/{subs,radar-card,radar-edit,found-poll,free-text,voice}.json`
- `docs/infrastructure/telegram-webhook.md` (registry rows of `sb`, `fp`), `docs/infrastructure/environments.md`

## Steps

Generators always with `--no-interaction`; tests first inside each step; Pint after every PHP edit.

Part A.

1. Read the specifications of WP-45, WP-44, WP-54 and WP-51; reconcile the names of "What comes from where" and
   write the differences into "Handoff".
2. `RadarTitle` with `RadarTitleTest`; `RadarCardRenderer`.
3. `SubsCommand` with the list, the empty state and the card; remove `subs` from the interim list and replace the
   interim `sb` registration; `SubsCommandTest`, transcript `subs.json`.
4. `FoundPoll` and `FoundPollKeyboard`; `FoundPollTest`.
5. `RadarStateActions` (pause with the poll, resume with the unseen list, mode); `RadarPauseResumeModeTest`.
6. `RadarHiddenRules` in the legacy behaviour, then the `dev033` branch with `todo` tests.
7. `RadarDelete` with the confirmation, the idempotent second press and the poll; `RadarHiddenRulesDeleteTest`.
8. `RadarEdit`, `EditScreenStep`, the edit branch of `SaveRadar`, cancel in edit mode (legacy and `dev030`), the
   `dev031` branch; `RadarEditTest`, transcript `radar-edit.json`.
9. Registry rows; `make ci-backend`; PR A; deploy; the checklist lines of the radar screens on staging and
   production.

Part B.

10. The shared-file PRs: `llm` queue in `config/horizon.php`; `AI_*` keys in `.env.example`, all blank. Publish
    `config/ai.php` and take the two vendor names out of it.
11. `PiiMasker` with the corpus (at least 50 positive and negative cases in ru, uz Latin, uz Cyrillic and en).
12. Migration, `LlmCall`, `LlmGateway` with the package fake, the spend counter, the feature and `llm:feature`;
    `LlmGatewayTest`, `LlmBoundaryTest`.
13. `QueryParser`, its prompt and schema, `phrases.json`; `QueryParserTest`; `llm:benchmark` with
    `LlmBenchmarkTest`.
14. `FreeTextQuery`, `ParseUserQuery`, the review title and notes in `ReviewStep`; `FreeTextQueryTest`.
15. `VoiceQuery`, `TranscribeVoiceQuery`; `VoiceQueryTest`.
16. The no-trace test: after a text and a voice were processed, no table, log line, cache key, Telescope entry or
    failed-job row contains the phrase.
17. `make ci-backend`; review by the `security-reviewer` agent (masking, injection, logging); PR B; deploy with the
    feature off and no provider configured. When the team has put a provider and its key on staging: run
    `llm:benchmark`, switch the feature on, and — once radars are on there (WP-57) — run the phrase set by hand
    and tick the free-text lines; then the same on production.

## Behaviour to reproduce

Owned: handlers BOT-015, BOT-054 … BOT-056, BOT-063 … BOT-071; buttons BTN-049 … BTN-065; texts TXT-BOT-011,
TXT-BOT-033, TXT-BOT-040 … TXT-BOT-043, TXT-BOT-057 … TXT-BOT-071. Brand words in quoted legacy texts are marked.

While radars are switched off (DEC-51; staging and production until WP-57) `/subs`, every `sb` button, a typed
phrase and a voice message get `bot.radar.soon` «Радар скоро заработает…» from the router of WP-51, and nothing
below runs; the poll buttons (`fp`) are not marked, because a poll exists only after a pause or a delete. Legacy
has no such state. Everything below describes the bot with radars on.

### `/subs` and the radar card (BOT-015, BOT-063, BOT-064, BOT-065)

| # | Trigger | What the user sees | Answer |
| - | ------- | ------------------ | ------ |
| 1 | `/subs`, no radars | New message: `Радаров пока нет. Опишите, что ищете, — включу первый: он будет следить за каналами и присылать новые подходящие объявления сюда, в чат.` (TXT-BOT-057) with `➕ Новый радар` (BTN-030, owned by WP-54) | — |
| 2 | `/subs`, 1 … 10 radars | New message: `📡 Радар (k из 10)` + `Радар проверяет каналы и присылает новые объявления в чат. ▶️ — включён, ⏸ — на паузе. Нажмите на радар, чтобы изменить.` (TXT-BOT-058). One button per radar (BTN-049): `▶️ <title>` or `⏸ <title>`; last row `➕ Новый радар`. The limit is `config('radar.max')` (BR-BOT-064) | — |
| 3 | `📡 Радар` under a saved radar (BTN-029, WP-54), `◀️ К списку` (BTN-060), after a delete | The pressed message becomes view 1 or 2 | silent |
| 4 | A radar button | The same message becomes the radar card (TXT-BOT-060, layout `tb:698–708`) | silent |

- Radar title (TXT-BOT-059, BR-BOT-065): `<сделка> · <объект> · <комнаты> · <город> · <первый район> +N · <бюджет>`,
  for example `Аренда · квартира · 2 комн. · Ташкент · Юнусабад +1 · до $800/мес`. Without districts: `… · Ташкент ·
  до $800/мес`. Parts that are "any" are left out.
- Radar card: the title; one status line (BR-BOT-066) — `▶️ Включён — новые объявления приходят сразу` / `⏸ На
  паузе — объявления не приходят` / `📬 Подборкой — список новых объявлений в заданное время (/settings)`, where
  paused wins over digest; the summary rows of WP-54 (with the extra-filters line for a radar made in the Mini App);
  `🙈 скрыто: <@канал · район>` when the radar has hide rules.
- Card keyboard: `⏸ Пауза` (BTN-050) or `▶️ Включить` (BTN-051) · `✏️ Изменить` (BTN-055) / `📬 Присылать
  подборкой` (BTN-052) or `📡 Присылать сразу` (BTN-053) / `🙉 Показать скрытое` (BTN-054, only with hide rules) /
  `🗑 Удалить` (BTN-057) · `◀️ К списку` (BTN-060).
- A radar deleted elsewhere: its button gets the alert of TXT-BOT-039; the next `/subs` shows the current list.

### Pause, resume, mode, hidden rules

| # | Press | Toast | Then |
| - | ----- | ----- | ---- |
| 1 | `⏸ Пауза` | `На паузе ⏸` (TXT-BOT-062) | Card re-rendered: paused status, button `▶️ Включить`. When the service says `ask_found`, the poll arrives as a new message (BR-BOT-067) |
| 2 | `▶️ Включить`, nothing unseen | `Радар снова включён ▶️ Нового подходящего пока нет — пришлю, как появится` (TXT-BOT-063) | Card re-rendered |
| 3 | `▶️ Включить`, K unseen matches | `subs.resumed_found` — «Радар снова включён ▶️ {K}, которые вы не видели, — ниже» (Q-BOT-045, closed by specification) | Card re-rendered; the job `SendStarterList` of WP-54 sends those K rows as a new message; they are recorded as delivered (BR-API-089) |
| 4 | `📬 Присылать подборкой` | `Теперь — подборкой в заданное время` (TXT-BOT-064) | Status `📬 Подборкой …`, button `📡 Присылать сразу` |
| 5 | `📡 Присылать сразу` | `Теперь — сразу` (TXT-BOT-065) | Button `📬 Присылать подборкой` |
| 6 | `🙉 Показать скрытое` | `Скрытое снова показывается` (TXT-BOT-066) | All hide rules of the radar are removed; the `🙈` line and the button disappear (BR-BOT-063) |

- A mode change never changes `active`; a pause never changes the mode.
- WP-45 counts the radar limit on active radars. `▶️ Включить` beyond the limit throws `RadarLimitReached`: alert
  `radar.limit_reached` (key of WP-54), the radar stays paused. In `📡 Радар (k из 10)`, k is the number of active
  radars, so it never exceeds the limit; paused radars are listed all the same.
- Radar writes count against the per-user radar-write limit of the bot limiter (SEC-REQ-027).
- With `bot.dev033` on (DEV-033, tests `todo`): the button reads `🙈 Скрытое (N)` and opens a list with one `✖`
  button per rule, «Показать всё скрытое» behind a confirmation, and a way back to the card.

### Delete (BOT-068)

1. `🗑 Удалить` → the message becomes `Удалить радар «<название>»?` (TXT-BOT-061) with `🗑 Да, удалить` (BTN-058,
   style `danger`) · `✖️ Отмена` (BTN-059). Silent.
2. `✖️ Отмена` → the card again, radar intact.
3. `🗑 Да, удалить` → toast `Радар удалён` (TXT-BOT-067); the message becomes the list, or the empty state when none
   is left (BR-BOT-068); when the service says `ask_found`, the poll arrives with trigger `delete`.
4. A second confirm (double tap, old copy) finds no radar: the list is re-rendered with the same toast.
5. Number buttons of the deleted radar's starter list keep opening cards (BR-BOT-048).

### Poll «Нашли жильё?» (BOT-069, BOT-070, BOT-071)

| # | Step | Text and buttons |
| - | ---- | ---------------- |
| 1 | Ask — new message after a pause or a delete with `ask_found` | `🏠 Нашли жильё?` + `Подскажите одной кнопкой — так мы поймём, помогает ли kvadro² [brand → :brand] искать.` (TXT-BOT-068). Buttons two per row: `🎉 Да, через kvadro² [brand → :brand]` (BTN-061) · `🏠 Да, в другом месте` (BTN-062) / `🔎 Ещё ищу` (BTN-063) · `🙅 Больше не ищу` (BTN-064) |
| 2 | `🏠 Да, в другом месте` | The message becomes `🏠 Где нашли?` + `Подскажите — так мы поймём, каких объявлений нам не хватает.` (TXT-BOT-069) with seven options (BTN-065): `📢 Telegram-канал` · `🛒 OLX` / `🌐 Uybor, Uysot…` · `🤝 Риелтор` / `👥 Знакомые` · `🪧 На доме, на улице` / `Другое` |
| 3 | Any where-option | The message becomes `🎉 Поздравляем! Спасибо, что рассказали — это помогает нам стать лучше.` (TXT-BOT-070), no buttons |
| 4 | `🎉 Да, через …` | TXT-BOT-070, no buttons |
| 5 | `🔎 Ещё ищу`, `🙅 Больше не ищу` | `found.searching`, `found.stopped`, no buttons (TXT-BOT-071 was never observed; Q-BOT-006, closed by specification; the product owner confirms the wording) |

- Stored codes (BR-BOT-070, WP-13): answer `homi` / `elsewhere` / `searching` / `stopped`; where `telegram` / `olx`
  / `site` / `agent` / `friends` / `street` / `other`; trigger `pause` / `delete`.
- One answer per poll (BR-BOT-071): the first press removes the buttons; a lock
  `Cache::lock('bot:fp:{chat}:{message}', 30)` makes a double tap store one row. `FoundSurveyService` itself accepts every call (WP-44).
- Whether to ask is the rule of WP-45 (`ask_found`, with its suppression window after an answer); this package
  never decides it. «Больше не ищу» pauses nothing.
- All poll presses are answered silently. A poll message too old to edit gets the reply as a new message.
- The bot's poll has no share step (`04` §10).

### Edit an existing radar (BOT-066, BOT-067)

1. `✏️ Изменить` → the card becomes `Радар — что изменить?` (TXT-BOT-033) + the summary rows + the `✏️` buttons of
   the branch (WP-54) + `✅ Сохранить` (BTN-056, style `primary`) · `✖️ Отмена`.
2. A `✏️` button opens its step with the header `Изменение радара · шаг N из M` (TXT-BOT-011) and the current value
   ticked; a choice or `◀️ Назад` returns to the edit screen (BR-BOT-069).
3. `✅ Сохранить` → toast `Сохранил ✅` (TXT-BOT-075, owned by WP-56). For an active radar the message becomes `✅
   Радар включён` + summary (TXT-BOT-034, owned by WP-54), as legacy. For a paused radar, which stays paused, the
   message is `radar.updated_paused` with the paused status line (never observed in legacy; Q-BOT-030, closed by
   specification). Then the starter list with only listings not sent before (BR-BOT-049): after `2 комн.` →
   `2–3 комн.` it holds the three-room listings only. No sticker, no tip.
4. `✖️ Отмена` → `Отменил. Новый радар — /new, список — /subs` (TXT-BOT-026, owned by WP-54), keyboard removed,
   radar unchanged (legacy; LB-BOT-020). With `bot.dev030` on: the unchanged radar card in the same message.
5. With `bot.dev031` on: the saved message is titled `radar.updated` («Радар изменён») with the real status line
   (LB-BOT-021).
6. The edit makes the radar equal to another radar of the user (`RadarDuplicate`): toast `radar.twin_exists`
   (key of WP-54), nothing changes.
7. The radar was deleted elsewhere during the edit: save → alert of TXT-BOT-039 and the message becomes the list.

### Free text (BOT-054, BOT-055) and voice (BOT-056)

| # | Input | Outcome |
| - | ----- | ------- |
| 1 | A text that is not a command, while no amount is awaited (BR-BOT-051) | Parsed. Understood → reaction 👌 on the user's message (BR-BOT-052) and a **new** message: the review of WP-54 titled `Вот что я понял — проверьте` (TXT-BOT-040) with the same keyboard |
| 2 | The phrase names no deal | Deal `rent_long` and the note `Не назвали тип сделки — поставил по умолчанию, поправьте кнопками ниже.` (TXT-BOT-041, BR-BOT-053) |
| 3 | The phrase names a place outside the supported cities | City Tashkent, whole city, and the note `Не понял, к какому району отнести: <Самарканд>. Районы можно выбрать кнопкой «✏️ Районы».` (TXT-BOT-042, BR-BOT-054; LB-BOT-017). With `bot.dev028` on: no default; the wizard opens at the area step with `freetext.unsupported_city` |
| 4 | Nothing usable (`привет`) | No reaction; reply `Не понял, что искать. Опишите жильё, например: «двушка в Юнусабаде до 600$ без риелторов» — или настройте радар кнопками.` (TXT-BOT-043) with `➕ Новый радар` (BTN-030) and `✉️ Написать в поддержку` (BTN-034, owned by WP-52) |
| 5 | No provider configured, feature off, cap reached, timeout, provider error | The same reply as row 4 — the hint that points to the wizard, never an error text; one log line with the reason; no retry |
| 6 | A voice message up to 60 seconds and 1 MB | Transcribed, then handled as rows 1 … 5; the 👌 goes on the voice message |
| 7 | A longer or larger voice | `voice.too_long`; nothing is downloaded |
| 8 | Over the hourly limit | `bot.common.slow_down` once per window |

- A phrase sent while a wizard is open starts a new review; the older wizard message becomes outdated.
- Districts of another city in the parser's answer are dropped and listed as unknown places.
- `650` typed when nothing is awaited is a phrase like any other.
- Edited messages are not parsed again. `video_note` and audio files are not voice queries (WP-52 answers them).
- The provider never receives a phone number, a handle, a link or an e-mail (BR-BOT-088, SEC-REQ-042). The model's
  answer is data, never an instruction: only schema-valid fields are used (SEC-REQ-043).
- Nothing of the message is stored (BR-BOT-055): the ledger row loses its text and voice object (WP-50), the job
  payload is encrypted and removed, logs carry the duration and the outcome only.
- Voice was never observed in legacy (Q-BOT-005): the behaviour above follows the promise of the legacy privacy text.
- The language model, different from legacy by decision (DEC-55): the legacy bot used one vendor, Google Gemini,
  and named it in its privacy text. HOMI is tied to none: provider and model are configuration, and the team
  compares candidates with `llm:benchmark` before it switches.

### Defects and behaviour changes

| # | Item | What is done |
| - | ---- | ------------ |
| 1 | Unsupported city silently becomes Tashkent | Legacy kept with its note; LB-BOT-017 behind DEV-028, `bot.dev028` off |
| 2 | Cancel of an edit shows the new-radar text | Legacy kept; LB-BOT-020 behind DEV-030, `bot.dev030` off |
| 3 | Edit save always says «Радар включён» | Legacy kept for an active radar; a paused radar gets a true text; LB-BOT-021 behind DEV-031, `bot.dev031` off |
| 4 | «Показать скрытое» removes all rules, no confirmation | Legacy kept; LB-BOT-024 behind DEV-033, `bot.dev033` off |
| 5 | Twin radars | Decided by the radar service (WP-13, WP-45); no flag here |

## Tests

Conversation tests use the runner of WP-51. The radar and survey services run on the real implementations of WP-45
and WP-44 with factories; the LLM runs on the `laravel/ai` fake with `Http::preventStrayRequests()`.

Unit (Pest):

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `RadarTitleTest` | full title; no districts; one district; `+N`; "any" parts left out; 60-character cut; ru, uz, en |
| 2 | `PiiMaskerTest` | the corpus: every positive masked, no negative masked (`650$`, `85 м²`, `1 200 000 сум`); stable numbering; the same phone twice; zero-width characters; text that is only a phone |

Feature and conversation (Pest):

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `SubsCommandTest` | with `radar.creation_enabled` off (every other case of this table runs with it on, the `phpunit.xml` value of WP-11): `/subs` and an `sb` press → `bot.radar.soon`, nothing rendered; empty state; one radar → text `(1 из 10)` and the titled button; card of an active instant radar; paused digest radar → paused status and `▶️ Включить`; active digest radar; radar with two hide rules → `🙈` line and button; `◀️ К списку`; a radar deleted elsewhere → alert; a Mini App radar → extra-filters line; `en`; ten radars |
| 2 | `RadarPauseResumeModeTest` | pause with `ask_found` → toast, card, then the poll; resume with nothing unseen; resume with 3 unseen → toast with 3, list of 3, delivered set +3; digest and back; pause on an old card of a paused radar → toast, no second poll; a forged radar key of another user → alert, the other radar unchanged |
| 3 | `RadarHiddenRulesDeleteTest` | legacy unhide; confirmation text with the title and the `danger` style; cancel; confirm with radars left → list; last radar → empty state; double confirm → one delete; number button of the deleted radar's starter list still opens; `dev033` cases (`todo`) |
| 4 | `RadarEditTest` | edit screen; a step with the edit header and the tick; `2–3` → save → toast, `✅ Радар включён`, starter list of unseen only; paused radar → `radar.updated_paused`, still paused; cancel (legacy); a Mini App radar with `polygon`, `renovation`, `price_min` keeps them after a budget edit; deleted during the edit → alert and list; duplicate → toast; two edit sessions → the older save gets the alert; `dev030`, `dev031` (`todo`) |
| 5 | `FoundPollTest` | the four answers store `homi`, `elsewhere`, `searching`, `stopped` with the trigger; elsewhere → seven options → `olx` stored on the same row → thanks without buttons; double tap → one row; trigger `delete`; `ask_found` false → no poll; another user's poll message cannot be answered (the actor is the presser) |
| 6 | `LlmGatewayTest` | provider, model and timeout of the call are the configured ones — two different provider names and models set through `config()` in turn are each recorded by the fake; an empty provider, an empty model and an empty key each → `LlmUnavailable` with `not_configured`, no call; the cost follows `ai.pricing`, an unpriced model uses its `default`; the fake receives the masked prompt; schema violation → `LlmInvalidOutput`; link or phone in the output stripped; timeout → `LlmUnavailable`; cap reached with a frozen clock and the UTC day boundary; feature off → no provider call; the `llm_calls` row has the hash, tokens, cost and no text; a provider error log line holds neither the input nor the placeholder map |
| 7 | `QueryParserTest` | `phrases.json` in ru, uz and en against the fake: expected filters, `dealDefaulted`, `unknownPlaces`; an injection corpus («ignore previous instructions», fake JSON, a phone in the answer) yields only schema-valid output |
| 8 | `FreeTextQueryTest` | «двушка в Юнусабаде до 600$» → 👌 and the review with `🏠 Аренда · квартира · 2 комн.`, `📍 Ташкент · Юнусабад`, `💰 до $600/мес`, the note of TXT-BOT-041; save creates the radar; «купить дом в Самарканде» → `📍 Ташкент целиком` and the note naming the place; «привет» → TXT-BOT-043 with two buttons, no reaction; a phrase with a synthetic phone and handle → masked at the fake; the 31st phrase in an hour → one notice; feature off → TXT-BOT-043, no call; no provider configured → TXT-BOT-043 with its two buttons, no call and no `bot.common.error`; radars switched off → `bot.radar.soon`, no job, no call; a uz phrase → review in uz; `dev028` (`todo`) |
| 9 | `VoiceQueryTest` | 5 seconds with a fake transcript → `getFile`, download, 👌, review; transcript «привет» → TXT-BOT-043; 90 seconds → `voice.too_long`, no `getFile`; transcription throws → TXT-BOT-043, no retry; the 11th voice in an hour; a phone in the transcript is masked before the parser |
| 10 | No-trace test | after cases 8 and 9: `telegram_updates`, `llm_calls`, `failed_jobs`, the log file of the test run, the cache and the storage disks contain neither the phrase nor the transcript |
| 11 | `LlmBoundaryTest` (arch) | only `App\Services\Parsing\LlmGateway` uses the `Laravel\Ai` namespace; no file under `backend/app` holds a provider name of the package's list; `config('ai.default')` and `config('ai.default_for_transcription')` are `null` when the env keys are unset |
| 12 | `LlmBenchmarkTest` | against the fake: one line per phrase and the totals, exit 0; `--provider` and `--model` reach the gateway; the rows of `llm_calls` have the task `benchmark` and no text; without a configured provider and without the options → a message naming the env keys, exit 1 |

## Acceptance checklist

Run in ru, uz and en on the staging bot and on the production bot; attach screenshots to the PR.

Radars are switched off on both bots until WP-57 (DEC-51). With this package's deploys only the first line can be
seen there; it is ticked then. The other lines are proven by the conversation tests when each PR is merged and are
run inside Telegram on the staging bot and on the production bot in WP-57, right after it switches radars on; the
free-text lines also need a provider configured by the team (DEC-55).

- [ ] Radars switched off: `/subs`, a typed phrase and a voice message each answer «Радар скоро заработает…» in
      the user's language; nothing is listed and nothing is sent to a language model.
- [ ] `/subs` without radars shows the empty text and `➕ Новый радар`.
- [ ] `/subs` with radars shows `📡 Радар (k из 10)`, the explanation, one titled button per radar with `▶️` or `⏸`.
- [ ] A radar button turns the message into the card: title, status line, summary, buttons in the legacy layout.
- [ ] `⏸ Пауза`: toast, paused status, `▶️ Включить`; the poll arrives as a new message.
- [ ] `▶️ Включить`: toast; with unseen matches the list arrives and those listings are not pushed again.
- [ ] `📬 Присылать подборкой` and `📡 Присылать сразу`: toast, status line and button change.
- [ ] `🙉 Показать скрытое` appears only with hide rules; one press clears them with the toast.
- [ ] `🗑 Удалить` asks with the radar's title; cancel returns to the card; confirm shows the toast and the list or
      the empty state.
- [ ] `◀️ К списку` returns to the list in the same message.
- [ ] Poll: the four buttons; «Да, в другом месте» → «Где нашли?» with seven options → thanks without buttons; the
      other three answers each end with their reply; the product is named HOMI.
- [ ] A second poll does not come right after an answer.
- [ ] `✏️ Изменить`: edit screen; a step shows «Изменение радара · шаг N из M»; save shows the toast, the saved
      text and only unseen listings; cancel shows the cancel text.
- [ ] A radar made in the Mini App with filters the bot cannot show keeps them after an edit in the bot.
- [ ] A typed description is answered with 👌 and the review «Вот что я понял — проверьте»; saving it creates the
      radar. (Needs radars switched on and a provider configured by the team; until then this line and the next
      four stay open.)
- [ ] A description without a deal shows the default note; one with an unsupported city shows the place note.
- [ ] «привет» gets the not-understood reply with two buttons and no reaction.
- [ ] A voice message is handled like the same text; a long voice gets the too-long reply.
- [ ] After these checks, a search of the server logs and of `telegram_updates` for the test phrase finds nothing.
- [ ] With the feature off, and with no provider configured, every free text and voice gets the not-understood
      reply with `➕ Новый радар` — no error text.
- [ ] Changing `AI_DEFAULT_PROVIDER`, the model and the key on staging, with a Horizon restart and no deploy, makes
      the next phrase go to the other provider (the `provider` and `model` columns of `llm_calls` show it); the
      totals of `llm:benchmark` for the chosen provider are in the PR.
- [ ] No provider is chosen in the code or in the committed `config/ai.php`: `default`,
      `default_for_transcription` and both models come from env.
- [ ] `config('bot.interim_commands')` no longer contains `subs`.
- [ ] Tests of this package are green; `make ci-backend` is green; the security review of the gateway is recorded in
      the PR.

## Handoff

Empty — nobody has started this package.
