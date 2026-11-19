# Developer's answers of 2026-11-19

Conventions: [`../README.md`](../README.md). This is the record of the question rounds held on 2026-11-19 while the
intakes of the legacy releases `index-BnFvC-Ft.js`, `index-CBlEKxdL.js` and `index-CIa0Ldj2.js` were prepared. The
developer (development track) answered each question; answers are quoted in Russian as given, or as the option
chosen. They are **decisions of the developer**.

The decisions are registered in [`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1. This file holds
the answer that the intake of `index-BnFvC-Ft.js` needs (DEC-57) and the eleven answers of the intake of
`index-CIa0Ldj2.js` (DEC-58 … DEC-68). The answers of the first round about the owner cabinet of
`index-CBlEKxdL.js` are added here by the PR that plans the cabinet.

## Answers

| # | Question | Answer | Recorded as | Note |
| - | -------- | ------ | ----------- | ---- |
| 1 | Release `index-BnFvC-Ft.js` lets the user choose how the bot sends listing cards («Классический» or «Новый», `03` SCR-048). Does HOMI ship the card styles in Wave 1, and does it announce `cards` as a «Новое» feature in a new product? | «Оба вида в первой волне, „Новый“ — по макетам legacy; без метки „Новое“» | DEC-57 | Both styles ship in Wave 1. «Новый» (`rich`) is built from the legacy mock-ups of the Mini App, because no other description of it exists (Q-BOT-046, RK-33). HOMI does not announce `cards`: `GET /reference` keeps `features: ["pets"]`, so the pill is never shown. The questions to the operator, Q-API-067 and Q-BOT-046, are asked in parallel |

## Answers for the intake of `index-CIa0Ldj2.js`

Asked one at a time, each with options, after the release had been compared with the built code. The option
recommended to the developer was the first one; answers 1, 2, 4 and 10 are not the recommended option.

| # | Question | Answer | Recorded as | Note |
| - | -------- | ------ | ----------- | ---- |
| 1 | Five behaviours that HOMI holds behind `DEV` flags, off, are legacy behaviour since `index-CIa0Ldj2.js`: the failure toast (DEV-016), history dates in Asia/Tashkent (DEV-014), the undo of «Уже сдано» (DEV-051), «С животными» only for long-term rent (DEV-017), the realtor-vote answer by `agent_marked` (DEV-010). What happens to the flags? | «Включить, флаги оставить» | DEC-58 | The defaults go on; the flags and both tested branches stay. The halves legacy did not adopt keep a flag of their own, off. Amends DEC-36 |
| 2 | Legacy answers `429 too many today` on a listing and shows «Лимит на сегодня». HOMI has no daily cap on opening listings. | «Экран и свой лимит HOMI» | DEC-59 | The screen, the contract mark `reason: "daily"`, and HOMI's own per-user cap; its threshold is set in WP-40 (Q-API-085). The operator is asked whether legacy counts per service key (Q-API-080) |
| 3 | Legacy answers `403 paused` and shows «Бот на паузе». | «Экран сейчас, переключатель в WP-40» | DEC-60 | The reason and the screen now; the switch in WP-40, off by default |
| 4 | Legacy reads a launch link `?radar=<id>`. | «Всё вместе с ботом» | DEC-61 | Specified now; the Mini App's reading and the bot's link and button are built with the bot packages (WP-52, WP-57) |
| 5 | Legacy offers «Площадь» for rent too. | «Для всех сделок, как в legacy» | DEC-62 | The sheet, the server and rent radars; the operator is asked whether legacy applies the range to rent (Q-API-082) |
| 6 | Legacy keeps the search feed mounted; Next keeps up to three routes. | «Память прокрутки» | DEC-63 | The route cache stays; a scroll memory per list key; measured on staging (Q-APP-030) |
| 7 | Legacy keeps the radar sheet mounted under a listing opened from it. | «Восстанавливать прокрутку» | DEC-64 | HOMI keeps the instant re-open and restores the strip's and the sheet's scroll |
| 8 | A sale listing opened by a launch link switches the feed under it to sale. | «Переключать при закрытии» | DEC-65 | When that listing closes, the feed becomes the sale defaults of its own city, as in legacy (not of the listing's city) |
| 9 | The collapsed title of daily rent. | «Как в legacy» | DEC-66 | The summary alone; amends D-SH-3 of WP-23 |
| 10 | «Смотрели»: re-created after a listing was opened (HOMI as built) or only on entering the tab or a pull (legacy since `index-CBlEKxdL.js`)? | «Оставить наше» | DEC-67 | A recorded deviation, DEV-053, on without a flag; WP-29's specification goes back to the as-built rule |
| 11 | What does `DELETE /listings/{number}/reports` withdraw? | «Только „Уже сдано“» | DEC-68 | The caller's `rented` vote and its hidden row; a repeat answers `204` |

Five technical points were not asked. They are defaults of the integrator, written into the specifications and
listed in the PR for the reviewer; none is a decision of the developer:

- the mark "the launch listing was already opened" keeps a digest of the launch hash and the number, never the raw
  hash (SEC-REQ-007; WP-21, WP-36);
- `agent_marked` is `true` when this vote crossed the threshold and also when the author was already marked (WP-13,
  WP-44);
- the cap and the order of HOMI's own map answer are left to WP-42 as an open question (Q-API-086); on stubs the
  scenario `map_cut` produces a cut answer;
- the `homi` text `toast.reportedAgentReview` loses its last reader when the toast follows `agent_marked`, and WP-34
  removes it;
- the contact failures of the listing keep the haptic alone when the failure toast goes on (WP-34).

One wording differs from the option as it was shown. The option of answer 8 said that the feed opens on sale "in
the listing's city". Legacy keeps the feed's own city, and the question was whether to do what legacy does, so
DEC-65 records the feed's city.

## Order of work after the third release

On 2026-11-19 a third release past the pin was synced into the legacy tree: `index-CIa0Ldj2.js` (production
18 Nov 2026). It changes screens that HOMI has already built (the feed, the listing screen, reports, both maps,
radars and filters). The developer was asked in which order to go on and chose «По релизам, код до WP-31»:

1. the intake of `index-CBlEKxdL.js` with the audit of the owner cabinet;
2. the intake of `index-CIa0Ldj2.js` (audit, specifications, the contract on stubs, the `legacy` catalogue; no app
   code), which also defines the packages that bring the built code up to the pin;
3. the owner-cabinet plan;
4. those catch-up packages;
5. WP-31.

Each is its own branch and PR, merged on its own «сливай». The choice orders the queue
([`../wave-1/README.md`](../wave-1/README.md)); it is not a `DEC` row. The options not chosen: the catch-up packages
after WP-31 and WP-32 and before WP-33; one intake for both releases.
