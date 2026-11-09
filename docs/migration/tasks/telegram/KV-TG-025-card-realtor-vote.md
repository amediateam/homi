# KV-TG-025 — Card button «Это риелтор» with undo and weighted vote

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-REPORT-002, F-REPORT-003 |
| Dependencies | KV-TG-022 (card renderer); vote service with `agent` reason, weights, threshold and `withdraw` — F-REPORT-003 (API-016 domain); DEV-010 (`PROPOSED`); Q-BOT-029 |

## Goal

«Это риелтор» records one weighted `agent` vote of the user; the global realtor mark appears only past the backend's
threshold. After DEV-010 is approved, the toast says "thanks, we'll check" instead of promising a relabel, the user can
withdraw the vote with `↩️ Не риелтор`, and the button is hidden where the listing is already marked.

## Legacy reference

- BTN-041 `Это риелтор`: label unchanged; toast TXT-BOT-053 `Запомнил номер как риелторский — отмечу во всех его
  объявлениях`; repeat → TXT-BOT-054 `Уже отмечено`; **no undo** (`tb:663`, `tb:952–953`).
- Rule: BR-BOT-061 (marks the phone in all its listings, cannot be undone in the bot); `ab:224`, `ab:228`.
- Problems: LB-BOT-008 (no undo), LB-BOT-022 (one tap labels a person, always offered); `04` §10 "Rented / realtor
  votes" (Mini App hides `agent` when the listing is already not an owner's).
- Q-BOT-029 (legacy thresholds and anti-fraud formula unknown).

## Implementation

1. Read `04` §3.10, `16` SEC-REQ-045, `.ai/agents/security-reviewer.md`. Tests first
   (`php artisan make:test --pest Bot/Card/RealtorVoteTest`).
2. `php artisan make:class Telegram/Handlers/Card/VoteRealtor`: `k1:cd:<n>:ag:1` → vote service `report(user, listing,
   agent)`; a repeat (unique per user, listing, reason) is detected from the service result.
3. Toasts:
   - before DEV-010 approval: TXT-BOT-053, repeat TXT-BOT-054 (legacy wording);
   - after approval: `bot.card.agent.voted` («спасибо, проверим» wording of DEV-010, new text) and
     `bot.card.agent.already`; the switch is the config flag `bot.dev010` so the change is one line once approved.
4. Undo (DEV-010): after a vote the pressed copy re-renders row 3 as `[⭐ …][↩️ Не риелтор]`;
   `k1:cd:<n>:ag:0` → vote service `withdraw(user, listing, agent)` → toast `bot.card.agent.withdrawn` (new text,
   DEV-010) → default row restored. Before approval the undo button is not rendered.
5. Visibility (DEV-010): the renderer of KV-TG-022 hides the button when the listing is already marked as a realtor's
   or carries the verified-owner mark (F-OWNER-002); the handler still accepts a stale press and answers
   `bot.card.agent.already` without a vote.
6. The bot never changes the global mark itself; threshold, weights (Premium, username, photo, account age —
   BR-BOT-087) and the audit trail stay in the vote service (SEC-REQ-045).

## Files

- `backend/app/Telegram/Handlers/Card/VoteRealtor.php` (new)
- `backend/app/Telegram/Keyboards/ListingCardKeyboard.php` (undo row, visibility flag)
- `backend/config/bot.php` (`dev010` flag; new file if absent) , `backend/lang/{ru,uz,en}/bot.php` (`card.agent.*`)
- `backend/tests/Feature/Bot/Card/RealtorVoteTest.php` (new)

## API contract

Bot API: `answerCallbackQuery` (toast), `editMessageReplyMarkup`. Callbacks `k1:cd:<n>:ag:1|0`.

## Business rules

- Legacy BR-BOT-061 is replaced, not kept: one tap no longer marks a number (SEC-REQ-045 applies regardless of DEV-010,
  because it is a security requirement implemented in the vote service).
- `PROPOSED`: DEV-010 (weighted threshold, undo, honest wording, button hidden where marked) — decided by the developer
  and the product owner; tests for wording, undo and visibility are `->todo('DEV-010 PROPOSED')` until approval
  (`15` §1.4).
- Fixes LB-BOT-008 and LB-BOT-022 through DEV-010.

## Acceptance criteria

- One press creates one weighted vote; a second press creates none and answers the "already" toast.
- No press, by any number of presses from one user, sets the global realtor mark (only distinct weighted voters do).
- After approval: undo withdraws the vote and the sum used by the threshold drops; the button is absent on marked
  listings.
- Russian toasts equal TXT-BOT-053 / TXT-BOT-054 while DEV-010 is not approved.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | card → `press('Это риелтор')` (flag off) | toast TXT-BOT-053; one vote row; label unchanged |
| 2 | press again | toast TXT-BOT-054; still one row |
| 3 | one user, ten presses on ten copies | one vote; phone not marked |
| 4 | flag on → press | toast `bot.card.agent.voted`; row 3 `[⭐ В избранное][↩️ Не риелтор]` |
| 5 | flag on → `press('↩️ Не риелтор')` | toast `bot.card.agent.withdrawn`; vote `withdrawn_at` set; row restored |
| 6 | flag on, listing already marked as realtor's | card rendered without `Это риелтор` |
| 7 | flag on, stale copy of a marked listing → press | toast `bot.card.agent.already`, no vote |
| 8 | three distinct users with configured weights reach the threshold | mark set once by the vote service; the bot sends nothing extra |

## Edge cases

- A listing whose author is a channel (no phone): the vote is stored per listing; the vote service decides the effect.
- Undo after the threshold was crossed: the vote service recomputes and may lift the mark (audit row); the bot only
  shows the toast.
- Account deleted later (F-PRIVACY-002): votes follow Q-SEC-016 (delete or anonymise), decided in the erasure procedure.

## Security

- SEC-REQ-045 (detectors that label people): weighted distinct-voter threshold, undo for the voter, audit trail, kill
  switch — the bot never bypasses the service.
- SEC-REQ-011 / SEC-REQ-014: actor from `from.id`; listing by number; no foreign vote can be withdrawn.
- SEC-REQ-027: vote writes count against the per-user bot limits of KV-TG-006.

## Definition of done

Tests green (`make ci-backend`) with DEV-010 cases `todo` until approved, KV-QA-009 transcripts updated, F-REPORT-002
parity-gate row updated (G5 waits for DEV-010), `09` row updated, PR reviewed by the other developer and the
`security-reviewer` agent.
