# KV-FE-174 — Old-WebView and device pass

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); staging-bot runs **[PT]** |
| Complexity | M |
| Milestone | FE-5 (M9, stage S4) |
| Feature IDs | F-TMA-001, F-TMA-002, F-TMA-003, F-TMA-004, F-TMA-005, F-TMA-006, F-TMA-007, F-TMA-008, F-TMA-009 |
| Dependencies | KV-FE-003 (decided floor), KV-QA-022 (device-pass checklist), KV-INF-001 (dev bot), KV-INF-017 (staging bot, **[PT]**) |

## Goal

The new Mini App works on the oldest Telegram clients and WebViews the product decided to support (DEC-06) and degrades
to the «Обновите Telegram» screen below that floor — checked on real or emulated devices before the S4 canary.

## Legacy reference

- Legacy build target `chrome80 / edge80 / firefox72 / safari13.1` (`UNVERIFIED`, Q-APP-001); version gates TMA-042;
  boot failure screen SCR-001 (TMA-003); platform checks TMA-041.
- `15` §2.7 (manual device pass: Telegram iOS, Android incl. one old WebView, Desktop, Web; checklist from TMA-001…TMA-045).

## Implementation

1. Take the KV-QA-022 checklist and extend it with the new client's items: boot shell, nonce CSP, back stack, sheets,
   share, write access, location, home screen, DeviceStorage restore.
2. Devices: the lowest iOS version and the oldest Android System WebView inside the floor (from KV-FE-001), one below the
   floor (expects SCR-001), a current iOS and Android, Telegram Desktop (Windows/macOS) and Telegram Web.
3. Run on the dev bot; the staging run needs the production track's approval each time **[PT]**.
4. Record results per device and checklist item in `docs/migration/data/device-pass.csv`; file each failure as a bug
   against the owning task.

## States and texts

Below the floor: SCR-001 texts (ru «Обновите Telegram» / «Вернуться в бота» / «Попробовать ещё раз»; uz and en per
`03` §2 SCR-001).

## Interaction

Gestures per platform: swipe-back on iOS and desktop only, sheet drag everywhere, pull-to-refresh with vertical swipes
disabled (TMA-015).

## Telegram integration

TMA-001…TMA-045 (absences checked as absences).

## Storage and analytics

DeviceStorage on Telegram 9.0+ (TMA-037); `app_error` boot reports arrive for the below-floor device.

## Files

- `docs/migration/data/device-pass.csv` (new), checklist updates in KV-QA-022's document

## API contract

Dev or staging backend (legacy surface or v1 per FD-2).

## Business rules

Version gates degrade, never crash (`10` §5.14).

## Acceptance criteria

- Every checklist item passes on every in-floor device, or has a filed bug with an owner.
- The below-floor device shows SCR-001 and posts one `app_error` with `kind: boot`.
- No white screen on any device.

## Tests

Manual pass recorded; automated parts are in KV-FE-170.

## Edge cases

Android WebView updated during the pass (record the version); iOS Low Power Mode (lite mode auto stays off on iOS).

## Security

Test accounts only; no real users' data on screens or in recordings.

## Definition of done

Device-pass file complete; G9 evidence for the TMA features linked; reviewed by the other developer and the production
track for the staging part.
