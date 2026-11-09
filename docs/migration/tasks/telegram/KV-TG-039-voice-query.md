# KV-TG-039 — Voice radar queries

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-009 |
| Dependencies | KV-TG-038 (free-text flow and review); transcription through the provider abstraction of the LLM gateway (backend; `laravel/ai`); DEC-03; KV-TG-004 (`getFile`); Q-BOT-005 |

## Goal

A voice message is transcribed and handled exactly like a typed phrase; the audio and the transcript are never stored.
Long or failed voices get a clear answer. The legacy behaviour was never tested, so this task specifies it from the
`/privacy` promise.

## Legacy reference

- BOT-056 (voice parsed like text per `/privacy`, not tested), `tb:607`, `tb:854`; state machine `04` §3.9 (voice
  arrow inferred).
- Rules: BR-BOT-055 (Gemini parses voice; audio not stored), BR-BOT-088 (masking), BR-BOT-052 (reaction on understood).
- Open: Q-BOT-005 (accepted at all, same review, length limits).

## Implementation

1. Read KV-TG-038 and the transcription API of the installed `laravel/ai` (skill `ai-sdk-development`; use
   `search-docs` for the version). Tests first (`php artisan make:test --pest Bot/VoiceQueryTest`).
2. Router: a private `message.voice` → `Telegram\Handlers\VoiceQuery`; per-user voice quota 10 / hour (SEC-REQ-010,
   `PROPOSED` value); voices while an amount is awaited follow KV-TG-032.
3. Limits (`PROPOSED`, Q-BOT-005): `duration` ≤ 60 s and `file_size` ≤ 1 MB; above → reply `bot.voice.too_long` (new
   text, specification) and stop.
4. `php artisan make:job Jobs/Telegram/TranscribeVoiceQuery` on `llm`: `getFile` → download the bytes into memory
   (never to a disk or bucket) → transcription through the gateway (provider of DEC-03; masking applies to the
   transcript before parsing) → `QueryParser::parse(transcript, locale)` → the same outcomes as KV-TG-038 (👌 on the
   voice message + review TXT-BOT-040, or TXT-BOT-043). Bytes and transcript are discarded at the end of the job.
5. Transcription failure or empty transcript → TXT-BOT-043.
6. `telegram_updates` keeps no `voice` object after processing (KV-TG-003); logs carry only the duration and outcome.

## Files

- `backend/app/Telegram/Handlers/VoiceQuery.php`, `backend/app/Jobs/Telegram/TranscribeVoiceQuery.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`voice.*`)
- `backend/tests/Feature/Bot/VoiceQueryTest.php` (new)

## API contract

Bot API: `getFile`, file download from the Bot API file endpoint (URL built inside the client, never logged —
SEC-REQ-013), `setMessageReaction`, `sendMessage`. Internal: transcription → text; parser as in KV-TG-038.

## Business rules

- Kept: BR-BOT-052, BR-BOT-055, BR-BOT-088.
- Q-BOT-005 answered by specification (limits, same review); record in the PR. No DEV (legacy behaviour unobserved).

## Acceptance criteria

- A 5-second voice whose fake transcript is «двушка в Юнусабаде до 600$» yields the same review as the typed phrase and
  a 👌 reaction on the voice message.
- A 90-second voice gets `bot.voice.too_long` and no download.
- After the job no file, row, cache key or log line holds the audio or the transcript.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `sendVoice(duration: 5)` with transcript fake «двушка в Юнусабаде до 600$» | `getFile`, download, reaction 👌, review TXT-BOT-040 |
| 2 | transcript «привет» | TXT-BOT-043, no reaction |
| 3 | `sendVoice(duration: 90)` | `bot.voice.too_long`; no `getFile` |
| 4 | transcription fake throws | TXT-BOT-043; job not retried |
| 5 | 11th voice within an hour | one slow-down notice |
| 6 | transcript contains `+998000000001` | parser fake receives the masked form |
| 7 | after processing | `telegram_updates` row without `voice`; storage disks unchanged |

## Edge cases

- `video_note` and audio files (`message.audio`) are not voice queries: handled by KV-TG-020 as non-text messages.
- A forwarded voice from another chat: treated the same (the content is what matters); the forward origin is not stored.

## Security

- SEC-REQ-042…044 (masking, schema, quota, spend cap, kill switch), SEC-REQ-013 (file URLs contain the token — built and
  used only inside the client), SEC-REQ-036 (voice never stored).

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 voice transcript (`oracle: spec`) passes, F-BOT-009 parity-gate row updated
(G9 needs the vendor on staging), `09` row updated, PR reviewed by the other developer and the `security-reviewer` agent.
