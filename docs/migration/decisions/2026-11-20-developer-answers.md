# Developer's answers of 2026-11-20

Conventions: [`../README.md`](../README.md). This is the record of the question round held on 2026-11-20 for the
intake of the legacy release `index-YX9bFVws.js` (production `Last-Modified` Fri, 20 Nov 2026 01:05:43 GMT by the
legacy documents; [`../wave-1/baseline.md`](../wave-1/baseline.md)). The developer (development track) answered each
question; answers are quoted in Russian as the option chosen. They are **decisions of the developer**, registered in
[`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1 as DEC-89 … DEC-94.

The developer asked whether the plan needed correcting after the new legacy updates. The release was compared with
the built code and with the plan first (read only); the developer then asked for the questions «по одному и с
вариантами ответа». The option recommended to the developer was the first one; answers 2, 3, 7, 8 and 9 are not the
recommended option; answer 3 was typed in, not one of the options (the recommended one was «Бот сейчас, страница
позже»: the bot link now, the page later).

## Answers

| # | Question | Answer | Recorded as | Note |
| - | -------- | ------ | ----------- | ---- |
| 1 | The release invites owners «Сдаёте квартиру? Разместите бесплатно» at the end of the search feed, under the empty feed and on the listing card; legacy shows them to everyone, with no flag. HOMI's cabinet is behind a switch (DEC-81). When does HOMI show the invitations? | «Только при включённом кабинете (рекомендую)» | DEC-89 | Built in WP-82 with the other entry points. The question said that the survey's landlord block follows the same rule (asked with answer 3) |
| 2 | Legacy prints «Это всё по вашему поиску» only together with the invitation at the end of the search feed. What happens to that line while the cabinet is off? | «Показывать всегда» | DEC-90 | HOMI's own rule, a deviation (DEV-064): the line is built earlier, in the catch-up package WP-39, and WP-82 adds the invitation under it |
| 3 | The survey «Нашли жильё?» now shows «Съезжаете со старой квартиры?» with «Отправить хозяину», which shares a link to the owners' landing page (`/sdat-kvartiru/` and its uz and en pages). HOMI's plan has no such page, and the checkout's mirror of the legacy landing does not hold it. Where does «Отправить хозяину» lead? (The block itself only while the cabinet is on, as the invitations.) | «Оба» | DEC-91 | Asked again to say how both combine |
| 3a | «Оба» — the bot and the owners' landing page. How do they combine? | «Две кнопки в блоке» | DEC-91 | One button shares the page, the other the bot link; until the page exists, one button. The buttons' new texts are HOMI's own, in three languages (DEV-065). The page goes into WP-61 |
| 4 | The owner form now shows a ring with the percent while a photo uploads (an `XMLHttpRequest` with upload progress). WP-81 (not built) specifies a Server Action with spinner tiles and no percent. Does HOMI show the percent? | «Да, как в легаси (рекомендую)» | DEC-92 | WP-81 revisits how the photos are sent (`03` Q-APP-031); the code is untouched, the package is not started |
| 5 | The release adds motion and small improvements to screens HOMI has built (the leave of sheets, sub-pages and toasts; rolling numbers; the radar save «спиннер, затем галочка»; the favourite's sparks; the countdown ring of «Отменить»; the segmented thumb; «Поздравляем!» in the survey), about 2 000 – 3 000 lines with tests by the integrator's estimate. What is ported? | «Всё (рекомендую)» | DEC-93 | One catch-up package WP-39, possibly two |
| 6 | The order: the intake of `index-YX9bFVws`, then WP-38, then the new WP-39, then WP-31? | «Приём, WP-38, WP-39, WP-31 (рекомендую)» | — | Orders the queue; WP-37 any time |
| 7 | The legacy landing changed too (release of 19 Nov: `/` no longer follows the browser language, a language hint bar); `03b` and WP-61 describe the old behaviour. When does that enter the plan? | «Отдельным PR сейчас» | — | A separate landing intake, a docs PR before WP-38 |
| 8 | The listing card invites «Тоже сдаёте квартиру?» when the server sends `owner_entry: true`; legacy's documents leave its rule open. When does HOMI's server set it? | «На объявлениях от хозяев» | DEC-94 | An owner's listing (not a realtor's) that is not the viewer's own; false while the cabinet is off (the integrator's reading of DEC-89) |
| 9 | Two docs PRs come before WP-38 (the app intake, the landing intake); the owners' page can be described only after a landing sync. What comes first? | «Пока не начинать» | — | Then, asked which docs PR goes first: «первый — приём приложения»; asked whether to start it: «Начинать сейчас» |

## Order of work after the fourth release

Answers 6, 7 and 9 order the queue ([`../wave-1/README.md`](../wave-1/README.md)); they are not `DEC` rows:

1. the intake of `index-YX9bFVws.js` (audit, specifications, the new catch-up package WP-39, the `legacy` catalogue;
   no app code, no stub or contract change);
2. the intake of the legacy landing releases of 19 Nov 2026 (`03b`, WP-61), its own docs PR;
3. WP-38;
4. WP-39;
5. WP-31.

WP-37 can be taken at any time. The options not chosen: WP-39 before WP-38; WP-38 before the intake; the landing
changes as a note of this intake, or later before WP-61.
