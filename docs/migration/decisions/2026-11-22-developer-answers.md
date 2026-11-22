# Developer's answers of 2026-11-22

Conventions: [`../README.md`](../README.md). The record of the questions asked on 2026-11-22. Answers are quoted in
Russian as written or as the option chosen.

## The extra end-to-end runs of WP-33 (DEC-100)

Question: WP-33 (the frontend acceptance) adds to CI a nightly scheduled run (the performance measurements, WebKit/iOS,
desktop) and three more Playwright projects in every PR (old Telegram 6.0, the uz/en render, the dark theme). That
adds a noticeable number of billed GitHub Actions minutes. How should the extra runs start?

Options:

- On demand, without a schedule (recommended). The nightly job is built, but it starts only through
  `workflow_dispatch`, by hand before a pass inside Telegram. Every PR gets only the cheap checks — the bundle check
  and the chunk budgets (rows 3–6) — as a step of the existing e2e job. The projects old, uz/en and dark also run in
  the manual run.
- As in the specification: the nightly run every day, plus old, uz/en and dark in every PR. The most minutes.
- A weekly schedule: the same job once a week and by hand; only the cheap checks in a PR.

Answer: «По запросу, без расписания (Рекомендуется)». Registered as **DEC-100** in
[`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1.

## Header mode in every PR (DEC-101)

Question: by the specification of WP-33 every PR runs the whole end-to-end suite twice, in cookie mode and in header
mode (DEC-44). The e2e job of a PR takes about 21–23 minutes now; the second mode almost doubles it (about 40–45
minutes per PR). Shards were not approved earlier. How should header mode run?

Options:

- Whole suite by hand, a subset in a PR (recommended). Every spec in both modes runs in the manual job
  (`workflow_dispatch`, with old, uz/en, dark and the performance run, DEC-100). In every PR header mode runs only the
  tests tagged `@smoke`, the eight journeys and the session and data specs: about 5–7 minutes more.
- As in the specification: every PR runs the whole suite in both modes; about 40–45 minutes per PR, twice the minutes.
- By hand only: a PR runs cookie mode only, as now; header mode only in the manual run. The cheapest, but a
  regression of header mode is seen only in a manual run.

First answer: «Полный — вручную, в PR — подмножество (Рекомендуется)».

The estimate in that question was wrong, and the question was asked again. A survey of the suite in both projects
showed that 401 of the 480 tests already run in both modes in every PR: their specs loop over the two modes and name
the mode in the test's title. The header project then has only the 80 tests that name no mode: 1.4 minutes locally,
about 2 minutes on CI, not a doubling to 40–45 minutes. The question: keep the subset, or run header mode over the
whole suite in every PR?

Options: the whole suite in every PR (recommended; the header project runs every test that names no mode, about
2 minutes more; as the specification asks); keep the subset (`@smoke`, the journeys, the session and data specs; less
than a minute; the whole suite in the manual run).

Answer: «Весь набор в каждом PR (Рекомендуется)». It replaces the first answer and is registered as **DEC-101** in
[`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1.

## When WP-40 starts (DEC-102)

Question, asked at the handoff of the development track: after part 4 of WP-33 the package waits for the production
track (steps 14–17: staging and the pass inside Telegram). The next package of the queue, WP-40 (sign-in, users and
settings on the backend), depends on WP-33. Rule 1 of the queue and "Exit to stage C" of WP-33 make it wait until
WP-33 is `DONE`. When does the next developer start WP-40?

Options:

- Right after part 4 (recommended). Do not wait for the pass inside Telegram, as before under rule 8: WP-33 itself
  was built on packages whose rows were `WAITING`. If the pass finds defects, their fixes (step 16) go ahead of the
  queue.
- After the pass inside Telegram. By the letter of rule 1 and "Exit to stage C": WP-40 waits until WP-33 is `DONE`,
  and development stands still until the production track has done steps 14–17.
- Decide later. The handoff documents keep it as an open question.

Answer: «Сразу после части 4 (Рекомендуется)». Registered as **DEC-102** in
[`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1.
