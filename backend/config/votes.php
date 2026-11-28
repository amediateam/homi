<?php

/*
|--------------------------------------------------------------------------
| HOMI's report votes (WP-44, "Reports and votes"; SEC-REQ-045)
|--------------------------------------------------------------------------
| Every value here is a proposal until the product owner confirms it (WP-44, brief decision 17); they live in this
| one file and nowhere else. They are plain values, no environment key: a change is a deploy. The thresholds and the
| voters per reason are DEC-112 (the developer, 2026-11-28: three voters, thresholds 4.0 / 4.5), still proposals.
|
| - `weights`: a voter's weight, from the Telegram profile HOMI keeps (`users.is_premium`, `has_username`,
|   `has_photo`): `base`, plus `premium`, `username` and `photo` for each flag the voter has, at most `max`. The
|   legacy formula is unknown (BR-API-106).
| - `thresholds`: the weighted sum of distinct voters that marks a subject — `rented` per listing number (4.0),
|   `agent` per author key (4.5; one weight per user, however many of the author's listings he reported), `fraud` per
|   listing number (3.0), read for native numbers only (WP-80's range; the owner-cabinet plan). With `max` below every
|   threshold a single voter never reaches one; three bare accounts (3.0) mark no listing, three with a username
|   (3.75) no author.
| - `min_voters`: per reason, the distinct voters a mark needs besides the threshold — `rented` and `agent` three, as
|   their marks take effect for everybody with no review (rule 10 of the security reviewer: at least three independent
|   signals), also on a native number until WP-84 turns those crossings into operator holds; `fraud` two, read for
|   native numbers only, where a crossing is an operator hold (a human review). `VoteService` never reads fewer than
|   two, whatever the value, so one tap never relabels a person or a listing whatever the weights (SEC-REQ-045).
| - `agent_marked`: the answer `agent_marked` of an `agent` report is `true` when that vote crossed the threshold, and,
|   with `already_marked` on, also when the author's key was already marked (an integrator default, WP-44 step 6).
|
| The two detectors are switched by Pennant, not here: `php artisan votes:detector {rented|realtor} {on|off}`.
*/

return [
    'weights' => [
        'base' => 1.0,
        'premium' => 0.5,
        'username' => 0.25,
        'photo' => 0.25,
        'max' => 2.0,
    ],
    'thresholds' => [
        'rented' => 4.0,
        'agent' => 4.5,
        'fraud' => 3.0,
    ],
    'min_voters' => [
        'rented' => 3,
        'agent' => 3,
        'fraud' => 2,
    ],
    'agent_marked' => [
        'already_marked' => true,
    ],
];
