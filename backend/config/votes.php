<?php

/*
|--------------------------------------------------------------------------
| HOMI's report votes (WP-44, "Reports and votes"; SEC-REQ-045)
|--------------------------------------------------------------------------
| Every value here is a proposal until the product owner confirms it (WP-44, brief decision 17); they live in this
| one file and nowhere else. They are plain values, no environment key: a change is a deploy.
|
| - `weights`: a voter's weight, from the Telegram profile HOMI keeps (`users.is_premium`, `has_username`,
|   `has_photo`): `base`, plus `premium`, `username` and `photo` for each flag the voter has, at most `max`. The
|   legacy formula is unknown (BR-API-106).
| - `thresholds`: the weighted sum of distinct voters that marks a subject — `rented` per listing number, `agent` per
|   author key (one weight per user, however many of the author's listings he reported), `fraud` per listing number,
|   read for native numbers only (WP-80's range; the owner-cabinet plan). With `max` below every threshold a single
|   voter never reaches one.
| - `min_voters`: the distinct voters a mark needs besides the threshold, never fewer than two (`VoteService`), so one
|   tap never relabels a person or a listing whatever the weights (SEC-REQ-045).
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
        'rented' => 3.0,
        'agent' => 3.0,
        'fraud' => 3.0,
    ],
    'min_voters' => 2,
    'agent_marked' => [
        'already_marked' => true,
    ],
];
