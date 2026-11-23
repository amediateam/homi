# Developer's answers of 2026-11-23

Conventions: [`../README.md`](../README.md). The record of the questions asked on 2026-11-23. Answers are quoted in
Russian as written or as the option chosen.

## Where the timing limits of the performance budget come from (DEC-103)

Question (asked in Russian, while part 4 of WP-33 was in review as #121): rows 7 to 9 of the performance budget (the
first card photo, the Largest Contentful Paint, the frames over 28 ms while scrolling) were measured on the
developer's Mac, but the manual run on GitHub's runner judges them. CPU × 4 is relative to the host processor, so the
runner's values will differ. Should one manual `full` run on the PR's branch give the runner's limits (about 35–45
minutes of Actions)?

Options:

- Yes, one `full` run (recommended): the values from the log of the step "Performance budget" go into
  `perf-budgets.json` in the same PR. The cost is one full run of Actions minutes.
- No, keep the local ones: rows 7 to 9 keep the Mac's limits as provisional; the first manual run before the pass
  inside Telegram (steps 14–15) checks them and probably fails on them, and they are corrected then.
- Later, before steps 14–15: part 4 is merged with the local limits; the `full` run is done together with the run
  before the pass inside Telegram, and the runner's limits are written then in a small separate PR.

Answer: «Позже, перед шагами 14–15». Registered as **DEC-103** in
[`../24-three-wave-strategy.md`](../24-three-wave-strategy.md) §8.1. Consequence in part 4: rows 7 to 9 carry
`"provisional": true` in `perf-budgets.json`, so `check-budgets.mjs` prints their values and an over-limit value
without failing, until the first manual run gives the runner's values and a small PR writes them and drops the flag.
