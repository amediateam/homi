# Developer's answers of 2026-11-19

Conventions: [`../README.md`](../README.md). This is the record of the question rounds held on 2026-11-19 while the
intakes of the legacy releases `index-BnFvC-Ft.js`, `index-CBlEKxdL.js` and `index-CIa0Ldj2.js` were prepared, and
of the owner-cabinet plan, with two more questions on 2026-11-20. The developer (development track) answered each
question; answers are quoted in Russian as given, or as the option chosen. They are **decisions of the developer**.

The decisions are registered in [`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1. This file holds
the answer that the intake of `index-BnFvC-Ft.js` needs (DEC-57), the eleven answers of the intake of
`index-CIa0Ldj2.js` (DEC-58 … DEC-68) and the fourteen answers of the owner-cabinet plan (DEC-69 … DEC-81, and the
confirmation of DEC-65).

## Answers

| # | Question | Answer | Recorded as | Note |
| - | -------- | ------ | ----------- | ---- |
| 1 | Release `index-BnFvC-Ft.js` lets the user choose how the bot sends listing cards («Классический» or «Новый», `03` SCR-048). Does HOMI ship the card styles in Wave 1, and does it announce `cards` as a «Новое» feature in a new product? | «Оба вида в первой волне, „Новый“ — по макетам legacy; без метки „Новое“» | DEC-57 | Both styles ship in Wave 1. «Новый» (`rich`) is built from the legacy mock-ups of the Mini App, because no other description of it exists (Q-BOT-046, RK-33). HOMI does not announce `cards`: `GET /reference` keeps `features: ["pets"]`, so the pill is never shown. The questions to the operator, Q-API-067 and Q-BOT-046, are asked in parallel |

## Answers for the intake of `index-CIa0Ldj2.js`

Asked one at a time, each with options, after the release had been compared with the built code. The option
recommended to the developer was the first one; answers 1, 2, 4 and 10 are not the recommended option.

| # | Question | Answer | Recorded as | Note |
| - | -------- | ------ | ----------- | ---- |
| 1 | Five behaviours that HOMI holds behind `DEV` flags, off, are legacy behaviour since `index-CIa0Ldj2.js`: the failure toast (DEV-016), history dates in Asia/Tashkent (DEV-014), the undo of «Уже сдано» (DEV-051), «С животными» only for long-term rent (DEV-017), the realtor-vote answer by `agent_marked` (DEV-010). What happens to the flags? | «Включить, флаги оставить» | DEC-58 | The defaults go on; the flags and both tested branches stay. The halves legacy did not adopt keep a flag of their own, off — this split of three flags and the three new names are the integrator's reading of the answer, not part of it. Amends DEC-36 |
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

Six technical points were not asked. They are defaults of the integrator, written into the specifications and
listed in the PR for the reviewer; none is a decision of the developer:

- the mark "the launch listing was already opened" keeps a digest of the launch hash and the number, never the raw
  hash (SEC-REQ-007; WP-21, WP-36);
- `agent_marked` is `true` when this vote crossed the threshold and also when the author was already marked (WP-13,
  WP-44);
- the cap and the order of HOMI's own map answer are left to WP-42 as an open question (Q-API-086); on stubs the
  scenario `map_cut` produces a cut answer;
- the `homi` text `toast.reportedAgentReview` loses its last reader when the toast follows `agent_marked`, and WP-34
  removes it;
- the contact failures of the listing keep the haptic alone when the failure toast goes on (WP-34);
- a legacy `403 paused` under the service key reaches the user as `403 access_denied` with the reason `paused` and is
  not counted as a failure of the legacy breaker (WP-41).

One wording differs from the option as it was shown. The option of answer 8 said that the feed opens on sale "in
the listing's city". Legacy keeps the feed's own city, and the question was whether to do what legacy does, so
DEC-65 records the feed's city. The developer confirmed this reading on 2026-11-20 (answer 13 of the owner-cabinet
plan).

## Answers for the owner-cabinet plan

Asked one at a time, each with options, on the night of 2026-11-19 (round 1: scope; round 2: nine design questions
of the plan and the card styles) and on 2026-11-20 (two questions before this PR). The option recommended to the
developer was the first one; answers 1, 3, 4 and 10 are not the recommended option; answer 13 confirms DEC-65. Two
process answers of the first round are in "Order of work" below, and the card-style question of the second round
(10 of 10) was answered «Оба стиля, «Новый» по макетам (Recommended)», which is DEC-57 (the first table); none of the
three is a row here.

| # | Question | Answer | Recorded as | Note |
| - | -------- | ------ | ----------- | ---- |
| 1 | The owner cabinet «Сдать квартиру» of release `index-CBlEKxdL.js` (publishing a flat, photos, «Мои объявления», requests): in which wave of HOMI? | «Wave 1» | DEC-69 | Not the recommended option (Wave 2). New packages in the Mini App, the API (about sixteen native methods) and the bot |
| 2 | Where do HOMI owners' listings live in Wave 1, and where are they shown? | «Свои таблицы (Recommended)» | DEC-70 | Native tables, merged into the feed beside the listings read from legacy |
| 3 | Legacy's feed now holds listings of its own owners in `gate` mode (no phone; the seeker sends a request). What does HOMI do with them? | «Пересылать отклик в kvadro» | DEC-71 | Not the recommended option (ask the operator, hide them meanwhile). The same request form as for HOMI's owners; the operator is asked in parallel |
| 4 | How is the owner's phone number stored? «Дать номер» and «Показывать номер» need the number; the plan (DEV-011, WP-56) keeps owners' numbers only as a hash | «Номер открыто, как в kvadro» | DEC-72 | Not the recommended option (encrypted in its own table). `/owner` was not asked and keeps its hash |
| 5 | When is a HOMI owner's listing checked? Legacy checks only the phone before publishing | «Постмодерация (Recommended)» | DEC-73 | Automatic checks, then active at once; each publication reaches the operators' chat with «Снять» |
| 6 | The cabinet's fixes of legacy behaviour (then numbered DEV-053 … DEV-060) go behind flags that are off by DEC-36. What to do? | «Включить решением (Recommended)» | DEC-74 | Now DEV-054 … DEV-061 |
| 7 | What does a legacy owner listing that hides its number show while the relay does not work, or if the operator refuses? | «Показывать с плашкой (Recommended)» | DEC-75 | No contact action, a neutral bar; the product owner approves the words |
| 8 | What does the owner see about a HOMI seeker, and what goes to the operator with a relayed request? | «Имя из Telegram, хранится с откликом (Recommended)» | DEC-76 | The first name from the signed launch data, kept with the request and erased with it; the sheet says so |
| 9 | What does «Проверенный хозяин» promise on a HOMI owner listing, and how is a realtor's number recognised? | «Своя проверка (Recommended)» | DEC-77 | The per-phone limit, the author keys HOMI saw, HOMI's realtor votes; the info sheet reworded |
| 10 | Market verdict and «обычная цена» for HOMI owner listings; HOMI has no medians of its own in Wave 1 | «Свои медианы из карточек kvadro» | DEC-78 | Not the recommended option (none until the operator answers). The operator is asked as well |
| 11 | Where does the place picker take city and district from? | «Свои границы в PostGIS (Recommended)» | DEC-79 | The source is still to be checked (Q-DATA-051); PostGIS on the production database |
| 12 | Editing a published listing: legacy saves every change at once although the last button says «Сохранить изменения» | «Сразу, кнопка «Готово» (Recommended)» | DEC-80 | DEV-062 |
| 13 | (2026-11-20) DEC-65: does the feed under a closed sale listing switch to the sale defaults of the feed's city or of the listing's city? | «Город ленты, как в legacy (Recommended)» | DEC-65 | Confirms the recorded reading |
| 14 | (2026-11-20) A server switch `OWNER_CABINET_ENABLED`, like `RADAR_CREATION_ENABLED`, until the cabinet is ready? | «Да, выключатель (Recommended)» | DEC-81 | The full question is quoted below the table |

The question of answer 14, as asked (it fixes what DEC-81 covers): «Кабинет хозяина на серверах до готовности.
Предлагаю серверный выключатель OWNER_CABINET_ENABLED, как RADAR_CREATION_ENABLED у радаров. Пока он выключен,
создать черновик и опубликовать нельзя, а в настройках нет группы «Сдаю квартиру». Снять, поставить на паузу,
отметить «Сдано» и ответить на отклик можно всегда. Включает production track после бота и юридических ворот
(Q-SEC-021). Так?»

Technical points that were not asked are defaults of the integrator, written into the specifications WP-80 … WP-89
and listed in the PR for the reviewer; none is a decision of the developer:

1. Two contact methods: a request is `POST /listings/{number}/contact-request`; `POST /listings/{number}/contact`
   stays the only method that returns a number (WP-80).
2. Request limits answer `429 rate_limited` with `reason` `requests_fast`, `requests_day` or `requests_week` and
   `Retry-After` (WP-80).
3. `contact.mode: hidden` for a legacy listing placed by its owner whose number is hidden while the relay is off
   (DEC-75; WP-80, WP-42, WP-87).
4. Native numbers start at 10 000 000, from one PostgreSQL sequence, given at the first publish (WP-80, WP-84).
5. The shown point is a stable offset of at most 250 m, from an HMAC with `SHOWN_POINT_SECRET` (WP-84).
6. The phone window: for ten minutes after `phone-request` an own `+998` contact shared with the bot becomes the
   draft's number; outside it a contact goes to `/owner` (WP-84, WP-88).
7. The first name of DEC-76 comes from the current launch's `initData`, checked by WP-40's verifier; only
   `first_name` is kept (WP-85).
8. The realtor check of DEC-77: `agent` for an author key seen on three or more flats or marked by HOMI's votes,
   `fraud` from the operators' deny list, `limit` at two listings per phone (WP-84).
9. Limits: two listings per account and two per phone, drafts not counted, ten photos (WP-84).
10. The operators' notice of DEC-73 goes from HOMI's main bot to `OWNER_MODERATOR_IDS`; «Снять» sets `held`; the
    console commands `owner:hold`, `owner:release`, `owner:withdraw`, `owner:deny-phone` (WP-84, WP-89).
11. Harvested medians (DEC-78) come from the `comparison` block of legacy cards, ignored after 60 days; the usual
    price is the median ± 10 % (WP-84, WP-86).
12. An owner listing's number, texts and photos are erased 90 days after it left the feed for good; requests with the
    listing or with either user (WP-84, WP-85).
13. Requests expire after 48 h; the soft refusal follows the 10-minute undo window; «Оказался риелтором» stays open
    for 7 days after `given` (WP-85).
14. The relay has its own server switch `LEGACY_RELAY_ENABLED`, off by default (WP-87).
15. The native stub entries keep the default feed at 45 entries and three pages (WP-80).
16. The cabinet's renovation list is HOMI's configuration, not legacy's `owner` key (WP-80, WP-41).
17. Placement in the queue: WP-80 … WP-83 before WP-33, WP-84 … WP-86 before WP-48, WP-87 after it, WP-88 after
    WP-56, WP-89 after WP-57.
18. The cabinet is long-term rent only: a native listing's `deal` is always `rent_long` (WP-84, WP-86).
19. Publishing a `paused` listing keeps it paused; a `rejected` listing is published again only after the operators
    release it (WP-84).
20. No relisting from «История», as in legacy (WP-82, WP-84).
21. A HOMI realtor mark hides a legacy «Проверенный хозяин»; HOMI's reports are not passed to legacy (WP-42, WP-44,
    WP-83).
22. DEC-81's switch goes on on staging for the checks of WP-89 with test accounts before the legal gate closes, and
    on production only after the gates of `25` §5. Answer 14 named only «после бота и юридических ворот», so the
    staging step is a reading, not the answer (WP-89).

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

Two answers of the cabinet's first round, given earlier the same night, had set the frame: «Два PR после #83–#86
(Recommended)» — after the four open PRs, first the release intake, then a separate PR with the cabinet plan — and
«Готовить приём (Recommended)» — prepare both outside the repository while #83 … #86 waited. The cabinet's packages
come after the catch-up packages and WP-31: WP-80 … WP-83 close stage B before WP-33, WP-84 … WP-87 sit in stage C
and WP-88, WP-89 in stage D ([`../wave-1/README.md`](../wave-1/README.md)). None of this is a `DEC` row.
