# Developer's answers of 2026-11-20: the landing intake

Conventions: [`../README.md`](../README.md). This is the record of the second question round held on 2026-11-20, for
the intake of the legacy landing ([`../wave-1/README.md`](../wave-1/README.md), the row "Intake of the legacy
landing"). The developer (development track) answered each question; answers are quoted in Russian as the option
chosen. Answers 1, 2 and 4 are **decisions of the developer**, registered in
[`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1 as DEC-95 … DEC-97; answer 3 decides how this
intake is delivered and is not a `DEC` row.

The developer answered «Следующий по очереди» to the question whether to start the landing intake. Before the
questions the integrator reported what reading the legacy landing showed (read only):

- the audit `03b` (2026-11-09) describes legacy landing release `c63da0e3476a` of 2026-11-08, so four releases are
  behind it, not the two the queue row named: `67b3942a8340` (12 Nov: the showcase «Квартиры прямо сейчас», the
  count under the first button, the footer in link columns, «аренда и продажа» in the titles), `65998117d6ec`
  (14 Nov: icons, link underline), `b1b9a919ecc4` and `d9bbbc696337` (19 Nov: privacy, the language of `/`);
- the legacy landing sync downloads only `/`, `/uz/`, `/en/`, `/privacy.html` and their assets, never a
  backend-rendered page, so "the owners' page is described after a landing sync" (the intake of `index-YX9bFVws.js`)
  was wrong: no sync can bring it.

Every question was asked on its own with options; the option recommended to the developer was the first one.
Answers 1 and 3 are not the recommended option.

## Answers

| # | Question | Answer | Recorded as | Note |
| - | -------- | ------ | ----------- | ---- |
| 1 | The legacy landing shows the showcase «Квартиры прямо сейчас» since 12 Nov (rent or buy, a search form, ten fresh listings with photos, Tashkent districts with counts). All its links lead to legacy's SEO pages, which HOMI builds only in Wave 3 (DEC-38); HOMI's live-map pins lead into the Mini App. What does WP-61 do with the showcase? | «Всю витрину, поиск в Mini App» | DEC-95 | The recommended option was «Ряд карточек сейчас»: the cards now, the search form and the district links with the SEO pages in Wave 3. The search into the Mini App needs a new launch parameter of HOMI's own (DEV-067), built by the new package WP-62 |
| 2 | Legacy no longer translates `/` by the browser language since 19 Nov: `/` without `?lang=` and a stored choice is always Russian, and a browser in Uzbek or English sees a hint bar with links to `/uz/` and `/en/`. WP-61 still redirects `/` by the browser language. What does HOMI do? | «Как легаси сейчас (рекомендую)» | DEC-96 | DEV-038 becomes the default; its flag is removed from WP-61 |
| 3 | The showcase needs the district counts (`live.json → showcase`), which HOMI's `GET /landing/live` lacks, and legacy's pins may have `floor: null` while HOMI's `GET /landing/pins` has an integer. Nothing reads these methods yet. Where is the contract changed? | «Поменять контракт в этом PR» | — | The recommended option was to record it in WP-60 and keep this PR documents only. The contract is changed on stubs in this PR (backend, OpenAPI, generated types); the production track deploys it with the regular deploy |
| 4 | The owners' page «Сдать квартиру» (`/sdat-kvartiru/` and its uz and en pages, the target of «Отправить хозяину», DEC-91). The legacy landing sync does not download backend pages, and legacy's own backend checklist lists the page as not done, so its content is unknown. Where does it come from? | «Ждать легаси до WP-61 (рекомендую)» | DEC-97 | When WP-61 starts: legacy's page if it is known then (its documents, or the developer brings it), otherwise HOMI's own page. Until then the survey's block has one button with the bot link (DEC-91) |

The options not chosen: for 1, the cards now and the search with the SEO pages, or the whole showcase in Wave 3;
for 2, keeping the redirect by the browser language, or `/` always Russian without the hint bar; for 3, the
contract change recorded in WP-60; for 4, HOMI's own page now, or the developer bringing legacy's page for this
intake.
