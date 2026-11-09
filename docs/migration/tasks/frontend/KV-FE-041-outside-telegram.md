# KV-FE-041 — Outside-Telegram state

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-TMA-002 |
| Dependencies | KV-FE-040 (render gate); uses KV-FE-015 / KV-FE-016 (text), KV-FE-024 (`hasInitData`), KV-FE-038 (dev overlay); backend KV-BE-022 (API-003, see Implementation step 4) |

## Goal

When the Mini App URL is opened outside Telegram (a browser, a preview bot, a WebView without `initData`), the only UI
is the legacy one-sentence state «Откройте приложение через бота в Telegram.» (SCR-002) — no data request, no analytics,
no crash.

## Legacy reference

- SCR-002 (`03` §2): `$KVADRO_ROOT/demo/app/src/app/App.jsx:228-230` (`<div class="empty">{t('app.openViaBot')}</div>`);
  `$KVADRO_ROOT/demo/app/src/lib/api/client.js:35-38` (no prefetch without `initData`);
  `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:50-52` (bootstrap returns early).
- TMA-043 (outside Telegram: only this text; library fallbacks stay for robustness), TMA-006 (`initData` sources),
  `$KVADRO_ROOT/docs/api.md` §11 (`app_error` with an empty `tma ` header).
- `10` §5.7 item 5 (target-architecture note: the outside-Telegram screen could link to the bot through a public bot
  endpoint).

## Implementation

1. `frontend/app/app/(miniapp)/features/onboarding/OutsideTelegram.tsx`: a centred `empty` block (KV-FE-012) with the
   single sentence; no buttons (legacy).
2. Rendered by the gate of KV-FE-040 whenever `hasInitData()` is false — checked after the SDK wait (KV-FE-024), so a
   late SDK with `initData` still boots the app.
3. Nothing else runs: no prefetch (KV-FE-023 skips without `initData`), no `app_launch`, no `GET /api/meta`, no
   PostHog; the global error handlers stay installed but the journal sends nothing without `initData` (KV-FE-034).
4. API-003 is **not** called by this state (the legacy screen has no button). A «go to the bot» link built from
   `GET /api/bot` (`10` §5.7 item 5) would change what users see and needs a DEV row first; until then the dependency
   on KV-BE-022 only covers the boot screen's bot fallback (KV-FE-032).
5. Language: the KV-FE-015 detector without Telegram data → `kv-locale` if set, else `ru` (legacy `detectLocale`).
6. In development builds the emulator of KV-FE-038 overlays its paste form on this state.

## States and texts

| State | Condition | Text (key) |
| ----- | --------- | ---------- |
| outside Telegram | no `initData` after the SDK wait | `app.openViaBot` — ru «Откройте приложение через бота в Telegram.», uz «Ilovani Telegram boti orqali oching.», en «Open the app via the bot in Telegram.» |
| late SDK with `initData` | SDK arrives after the wait | the app boots normally (state never shown, or replaced) |

No loading, empty, error or disabled variants (static text).

## Interaction

None. Responsive: centred in the viewport at any width; dark or light per the theme rules of KV-FE-026 (`kv-theme` or
system light by default).

## Telegram integration

TMA-043 (outside Telegram), TMA-006 (`initData` from SDK or hash), TMA-004 (the decision waits for the SDK wait).

## Storage and analytics

- Storage: reads `kv-locale`, `kv-theme`; writes nothing.
- Analytics: none (no `$pageview` — analytics needs meta; no journal event without `initData`).

## Files

- `frontend/app/app/(miniapp)/features/onboarding/OutsideTelegram.tsx` (new)
- `frontend/app/tests/onboarding/OutsideTelegram.test.tsx`; `frontend/app/e2e/outside-telegram.spec.ts`

## API contract

n/a — no request is made in this state.

## Business rules

- Kept: SCR-002 behaviour; no requests without `initData` (`08` §1.2).
- No DEV (a bot link would need one; see step 4).

## Acceptance criteria

- Opening the Mini App URL in a plain browser shows exactly the sentence in the stored or default language; the network
  log shows no `/api/*` request and no PostHog request.
- A thrown error in this state produces no request.
- Visual: side by side with the KV-QA-019 baseline `SCR-002` (scenario `no-telegram`) — text, position, colours.

## Tests

- Component (`OutsideTelegram.test.tsx`): three locales; no fetch spy calls.
- E2E (`outside-telegram.spec.ts`): no Telegram object, no hash → state; hash with `tgWebAppData` but no SDK → the app
  boots (TMA-006 hash path).

## Edge cases

- Hash `#tgWebAppData=` present but empty: treated as no `initData`.
- The page is opened inside Telegram from a link preview without launch parameters: same state (legacy).
- Search-engine or link-preview crawlers: the document is dynamic and `noindex` is not required (the Mini App origin is
  not indexed; the landing owns SEO), but the state must not leak any data — it has none.

## Security

No data, no request; SEC-REQ-005 (the client never sends an empty `tma ` header).

## Definition of done

`make ci-frontend` green; component and E2E tests green (with KV-FE-010); SCR-002 baseline review recorded; parity gate
G4 for F-TMA-002 ticked (with KV-FE-024); `09` row updated; PR reviewed by the other developer.
