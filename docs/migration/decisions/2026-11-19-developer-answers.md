# Developer's answers of 2026-11-19

Conventions: [`../README.md`](../README.md). This is the record of the question round held on 2026-11-19 while the
intake of the legacy releases `index-BnFvC-Ft.js` and `index-CBlEKxdL.js` was prepared. The developer (development
track) answered each question; answers are quoted in Russian as given, or as the option chosen. They are **decisions
of the developer**.

The decisions are registered in [`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1. This file holds
the answer that the intake of `index-BnFvC-Ft.js` needs (DEC-57). The answers of the same round about the owner
cabinet of `index-CBlEKxdL.js` are added here by the PR that plans the cabinet.

## Answers

| # | Question | Answer | Recorded as | Note |
| - | -------- | ------ | ----------- | ---- |
| 1 | Release `index-BnFvC-Ft.js` lets the user choose how the bot sends listing cards («Классический» or «Новый», `03` SCR-048). Does HOMI ship the card styles in Wave 1, and does it announce `cards` as a «Новое» feature in a new product? | «Оба вида в первой волне, „Новый“ — по макетам legacy; без метки „Новое“» | DEC-57 | Both styles ship in Wave 1. «Новый» (`rich`) is built from the legacy mock-ups of the Mini App, because no other description of it exists (Q-BOT-046, RK-33). HOMI does not announce `cards`: `GET /reference` keeps `features: ["pets"]`, so the pill is never shown. The questions to the operator, Q-API-067 and Q-BOT-046, are asked in parallel |

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
