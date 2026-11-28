# Developer's answers of 2026-11-28

Conventions: [`../README.md`](../README.md). The record of the questions asked on 2026-11-28, while WP-44 (personal
lists, reports, surveys) and WP-45 (radars) were being built. Each answer is quoted in Russian as the option chosen.

## How many voters and how much weight a mark for everybody needs (DEC-112)

Question (asked in Russian): the security review of WP-44's votes found that two accounts — weights 2.0 + 1.0, or
1.5 + 1.5, since a username and a profile photo cost nothing — already mark a listing «сдано» (it leaves every user's
feed) or an author «риелтор» (every listing of that author loses its owner label). These are the specification's
proposals: thresholds 3.0 and at least two distinct voters. Rule 10 of the security reviewer asks for at least three
independent signals or a human review, and a mark cannot be taken off one author today, only the whole detector
switched off. How should it work?

Options:

- At least 3 voters (recommended): at least three distinct voters for «сдано» and «риелтор», two for native listings
  (only an operator hold there, which is a human review); thresholds stay 3.0; account age, a required card view, a
  circuit breaker on automatic marks and a command that takes the mark off one subject become proposals for the
  product owner in the Handoff.
- 3 voters + thresholds 4.0/4.5: as the first, plus thresholds «сдано» 4.0 and «риелтор» 4.5, so three bare accounts
  (3.0) mark nothing and the weight starts to count; the rest are proposals in the Handoff.
- The reviewer's full package: both of the above, plus a vote counts for everybody only from an account older than
  7 days that opened the card; a circuit breaker pauses the detector after about 20 automatic marks an hour; a command
  `votes:unmark` takes the mark off one subject with an audit row; about 300–400 more lines.
- As in the specification: two voters and 3.0 stay (proposals until the product owner decides); the risk and the
  reviewer's recommendations go to the Handoff.

Answer: «3 голосующих + пороги 4.0/4.5». Registered as **DEC-112**. Consequences: `config/votes.php` holds
`thresholds.rented` 4.0 and `thresholds.agent` 4.5 (`thresholds.fraud`, read for native numbers only, stays 3.0) and
`min_voters` per reason — `rented` 3, `agent` 3, `fraud` 2 — with a floor of 2 in the code. Native `rented` and `agent`
crossings keep the floor of 3 until WP-84 turns them into operator holds. The values stay proposals of
`config/votes.php` until the product owner confirms them; the reviewer's further proposals are in WP-44's Handoff.

## A total cap of radars per user (DEC-113)

Question (asked in Russian): `RADAR_MAX` (10) counts only the radars switched on, as legacy and the specification do.
The security review of WP-45 showed that paused radars pile up without a bound (create 10, pause them, create 10
more…, about 15 a minute): unbounded rows, an unpaginated `GET /radars`, and later the work of WP-46's matcher and
WP-47's erasure. Should there be a total cap per user, switched-on and paused together, answered with the same
`409 radar_limit`?

Options:

- A cap of 50 in all (recommended): a new key `radar.max_total` = 50 (no env key), checked only on a create; existing
  radars are never touched; the difference from legacy is recorded as a decision.
- A cap of 5 × `RADAR_MAX`: the same mechanism, the cap five times the active limit (50 at 10), growing with it.
- No cap, as legacy: nothing changes; only the new cap of 10 preview rounds per request holds the list's load; the risk
  goes to the Handoff until WP-57.

Answer: «Потолок 50 всего (Рекомендуется)». Registered as **DEC-113**. Consequences: `config/radar.php` holds
`max_total` 50; `RadarService::create()` refuses a new radar — not an `existing` or `reactivated` twin, which adds no
row — when the user already has 50 radars, under the same per-user lock as the active limit, with `409 radar_limit`
naming the total; radars above the cap stay, and resume, replace, mode, relax and delete are not checked against it.
