# Developer's answers of 2026-11-21

Conventions: [`../README.md`](../README.md). The record of the questions asked on 2026-11-21. Answers are quoted in
Russian as written or as the option chosen.

## The pipeline

Asked whether the agent may work one package ahead without waiting for a word, the developer answered: «мы достаточно
детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели
только вопросы не возникнуть!». It is rule 8 of [`../wave-1/README.md`](../wave-1/README.md), a working rule and not a
`DEC` row.

## The `@analytics` end-to-end run of WP-32 (DEC-98)

Question: the specification of WP-32 asks for a separate `analytics` end-to-end run — a second build of the app with a
fake PostHog key and its own tests — which adds billed GitHub Actions minutes to every PR that touches `frontend/**`
(the e2e job takes about 21 minutes), and e2e shards were not approved earlier. How should it run?

Options: inside the existing e2e job, as a further step like the `@radars-off` run (recommended; about 4–6 minutes more
per run, no new job); locally only for now; a separate job in `frontend-e2e.yml` (the most minutes).

Answer: «Внутри текущей e2e (Рекомендуется)». Registered as **DEC-98** in
[`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1.

## The size of the WP-81 pull request (DEC-99)

Question: WP-81 came to about 8 000 changed lines — 1 126 of them the generated legacy catalogue, 1 707 tests, about
5 200 code — and its specification moves the upload progress of the photos into a pull request of its own above
3 000 lines; since DEC-92 that transport (an `XMLHttpRequest` with progress) is the only way photos are uploaded, so
moving it out means a temporary upload through a Server Action, replaced afterwards. How should it be shipped?

Options: one pull request, the deviation written down (recommended); two stacked pull requests (the dictionary, the
addresses, the actions, the layer and the questionnaire; then the photos, the picker, the phone, publish, the done
step, the launch links and the end-to-end specs); the progress moved out as the specification says, with a temporary
Server Action upload.

Answer: «Один PR, отклонение записать (Рекомендуется)». Registered as **DEC-99** in
[`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1.

