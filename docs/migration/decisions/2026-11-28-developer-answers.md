# Developer's answers of 2026-11-28

Conventions: [`../README.md`](../README.md). The record of the question asked on 2026-11-28, while WP-44 (personal
lists, reports, surveys) was being built. The answer is quoted in Russian as the option chosen.

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
