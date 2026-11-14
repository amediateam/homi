# Developer's answers of 2026-11-14

Conventions: [`../README.md`](../README.md). This is the record of the question round held on 2026-11-14 after the
first draft of the three-wave plan. The developer (development track) answered each question; answers are quoted in
Russian as given, or as the option chosen. They are **decisions of the developer**. Where a decision touches the
production track or project rules, the row says so, and the first developer sees it in the review of PR #25.

The decisions are registered as `DEC-31` … `DEC-56` in [`../24-three-wave-strategy.md`](../24-three-wave-strategy.md)
§8. The plan built on them is [`../25-wave-1-plan.md`](../25-wave-1-plan.md) and the queue in
[`../wave-1/README.md`](../wave-1/README.md).

## Answers

| # | Question | Answer | Recorded as | Note |
| - | -------- | ------ | ----------- | ---- |
| 1 | Who controls the legacy bot, its domain and its backend server | «Внешний оператор, помогает» | Q-SYS-009 | An outside operator who carries out requests |
| 2 | What the operator will give for backend and data | «Только дамп и схема» | DEC-39 | No source code, no live database connection |
| 3 | Legacy Mini App releases every 1–3 days during the work | «Догоняем до переключения» | DEC-37 | Each legacy release is followed until HOMI no longer depends on legacy |
| 4 | How to move the Mini App code | «Пересборка по аудиту» | DEC-32 | Screens are rebuilt from the audit; the recovered code is a reference, not a source to copy |
| 5 | Legacy client defects in Wave 1 | «Все баги, кроме смены логики» | DEC-36 | All `LB` fixes are made; `DEV` behaviour changes stay off |
| 6 | Styling | «Tailwind 4 + токены» | DEC-44 | No copy of the legacy CSS files |
| 7 | Navigation | «Полный App Router» | DEC-44 | A file route per screen; sheets as parallel and intercepting routes |
| 8 | Where API requests run | «На сервере через cookie-сессию» | DEC-44 | Server Components and Server Actions; the Next.js server holds the session |
| 9 | Where the per-method switch lives | «Laravel как шлюз» | DEC-35 | Pennant flags per method, no deploy to switch |
| 10 | Contract between frontend and backend | «Сразу новый /api/v1» | DEC-41 | Laravel translates to and from legacy; the frontend never sees the legacy contract |
| 11 | How HOMI authenticates users in Wave 1 | «Пока будет новый бот с нашим backend старый бот будет работат в старом» | DEC-40 | HOMI's own bot signs `initData`; HOMI verifies with its own token |
| 12 | Role of the new bot | «Постоянный новый продукт» | DEC-40 | Not a test bot: users move to it over time and the old bot is closed later |
| 13 | How the gateway reaches legacy for users of the new bot | «Свои личные данные, чужие объявления» | DEC-42 | Personal data lives in HOMI from day one; legacy supplies shared listing data only |
| 14 | Form of the shared data | «Живой прокси, сервисный ключ» | DEC-42 | The operator adds a service key to legacy; this needs a change on the legacy side |
| 15 | Radars in Wave 1 | «Полностью в HOMI» | DEC-43 | Stored, matched and delivered by HOMI through the new bot |
| 16 | Scope of the bot in Wave 1 | «Полный паритет бота» | DEC-43 | All 84 handlers of 04 |
| 17 | Brand | «HOMI, дизайн тот же» | DEC-40 | Same interface; name, logo, bot name and links are HOMI |
| 18 | Who may use the new bot | «Открыт всем сразу» | DEC-43 | The access gate is built, its mode is open |
| 19 | Old WebViews | «Порог Next + экран „Обновите“» | DEC-44 | Next.js default floor; older engines see the update screen |
| 20 | Map engines | «Оба движка, как в legacy» | DEC-44 | MapLibre GL and Leaflet |
| 21 | New npm packages (maps, PostHog, icons, test tools) | «Согласовано всё пакетом» | DEC-49 | Project rule: dependency changes need the first developer's approval (`docs/handoff/parallel-work.md` §4). The install PR is where he confirms |
| 22 | Pull requests | «Крупные PR по модулям» | DEC-45 | One PR per module, about 1 500–3 000 lines, reviewed before merge. Changes the 400-line rule of `docs/handoff/parallel-work.md` §2 for Wave 1 |
| 23 | Who does the work | «Два разработчика + агенты» | DEC-45 | |
| 24 | How the two developers split the work | «фуллстак только по очереди там где ты остоновился он продолжит или там где он остоновился ты продоожиш» | DEC-45 | One queue, worked in relay; no split by stack |
| 25 | Order of the queue | «Сначала весь фронтенд на моках» | DEC-45 | Contract stubs, then the whole frontend, then the API, then the bot |
| 26 | Proof of "1:1" | «Функциональное совпадение» | DEC-46 | Same screens, texts and scenarios; small visual differences are accepted |
| 27 | Moving the old bot's users | «Без переноса данных» | DEC-40 | Users start empty in the new bot; the old bot only announces the move |
| 28 | Analytics | «Свой журнал + свой PostHog» | DEC-47 | New PostHog projects for staging and production |
| 29 | Landing | «Полный лендинг как у legacy» | DEC-38 | On `homi.uz`, without the SEO pages; the live blocks read the public data files of the legacy landing, which need no key |
| 30 | Testing inside Telegram during development | «сразу в staging и prod» | DEC-45 | No tunnel tool; DEC-24 is no longer needed |
| 31 | Telegram Web | «Поддерживаем, с запасным путём» | DEC-44 | Partitioned cookie; if the browser refuses it, a header token and client rendering |
| 32 | Source of listings after legacy | «Коллектор telegram.uz» | DEC-39 | Answers DEC-02 for the development track; the collector's owner and the first developer still have to agree |
| 33 | Contract and mocks | «Заглушки в Laravel» | DEC-41 | Stub routes with fixtures → OpenAPI → generated types |
| 34 | Releasing to production during Wave 1 | «Всё сразу на prod» | DEC-45 | Every merge goes to staging and production, stub-backed sections included |
| 35 | TypeScript generator | «openapi-typescript» | DEC-49 | Types only; calls go through `@homi/api-client` |
| 36 | Base UI components | «shadcn/ui + Radix» | DEC-44 | New dependencies, covered by DEC-49 |
| 37 | Localisation | «next-intl, язык в адресе» | DEC-44 | `/ru/…`, `/uz/…`, `/en/…` |
| 38 | Deadline | «Срока нет, важнее полнота» | DEC-45 | No scope cuts for a date |
| 39 | Media ownership defect (KI-25) | «Первой задачей» | DEC-45 | KV-BE-002 opens the queue |
| 40 | Reports and votes | «Храним и применяем в HOMI» | DEC-48 | Not sent to legacy |
| 41 | Admin panel | «Вне первой волны» | DEC-43 | |
| 42 | Format of the detailed plan | «Очередь + спецификация на модуль» | DEC-45 | `wave-1/README.md` and one file per work package |
| 43 | PR #25 | «Переписать план в этом же PR» | — | Done in this PR |

### Second round, the same day

Asked after the verification pass over the specifications. Each question had a default in the plan; the answers
replace the defaults.

| # | Question | Answer | Recorded as | Note |
| - | -------- | ------ | ----------- | ---- |
| 44 | Stub data visible on production | «Пометка „демо-данные“» | DEC-50 | Confirms the plan (`25` §4.4); closes the open point of RK-27 |
| 45 | Radars before the bot can deliver | «Создание выключено до отправки» | DEC-51 | One switch; the radar tab and the bot say "soon" until the sending package is live |
| 46 | The author's phone number | «Номер после нажатия» | DEC-52 | A behaviour change, on by decision: no raw number with the card, text masked, number through the counted contact method |
| 47 | Favourites and history against the legacy rate limit | «Постранично, по 20» | DEC-53 | A behaviour change, on by decision |
| 48 | The whole-city label | «<Город> целиком» | DEC-54 | A behaviour change, on by decision; uz and en wording goes to proofreading |
| 49 | Vendor of the language model for free-text and voice queries | «Будет все модели мы сами переключим» | DEC-55 | No fixed vendor: provider and model come from configuration, the team switches. Answers DEC-03 |
| 50 | Where the support buttons lead | «Свой бот поддержки» | DEC-56 | A new work package, WP-59. Answers DEC-21 |
| 51 | Where the operators of the support bot answer | «Личный чат оператора» | DEC-56 | The bot relays to the private chats of the operators and back |

## What the answers changed in the first draft

The first draft (commit `cf4d325`) planned a file-by-file port of the legacy client that would talk to the legacy
backend through nginx under the old bot. The answers replace that with a **new product**:

- a new bot under the HOMI brand, with HOMI's own users and personal data;
- a Mini App rebuilt on the App Router, Tailwind, shadcn/ui and next-intl, rendered on the server through a session;
- a Laravel `/api/v1` that is the only thing the frontend talks to, and that decides per method whether the answer
  comes from a stub, from legacy through a service key, or from HOMI's own code;
- radars, the whole bot and the landing inside Wave 1.

Legacy keeps running unchanged under its own bot. Nothing of a legacy user's data moves.

## Consequences the developer should know

These follow from the answers; none of them reopens a decision.

1. **Wave 1 is now a product build**, not a frontend port: 45 screens, the `/api/v1` surface, radars with delivery,
   84 bot handlers and the landing (RK-29).
2. **Stub data will be visible to real users on production** while a section still runs on stubs (answers 18 and 34).
   The plan adds a visible "demo data" marker driven by the same flag that selects the stub (25 §4.4); answer 44
   confirms it.
3. **The service key is a change the operator must make in legacy** (answer 14), although answer 2 says only a dump
   and a schema are on offer. Until the key exists the shared-data methods stay on stubs (RK-28).
4. **Listing identity changes in Wave 2.** Favourites, history and radars of HOMI users point at legacy listing
   numbers; listings from `telegram.uz` will have other identities. The per-user tables therefore store the source
   channel and post next to the number from the first day (Q-API-063).
5. **Rules of the repository that the answers change** and that need the first developer's agreement in the review:
   the PR size rule (answer 22), the dependency approval route (answer 21), and "local code never points at
   production" stays intact — only HOMI servers hold the service key.
6. **Four answers of the second round are deliberate differences from legacy** (46, 47, 48 and the support bot of
   50). They are not flags: the acceptance checklists list them as approved differences (DEC-46 stays "functional
   parity" for everything else).
