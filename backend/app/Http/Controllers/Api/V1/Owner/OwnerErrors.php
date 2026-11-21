<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Exceptions\Owner\OwnerCabinetDisabled;
use App\Exceptions\Owner\OwnerLimitReached;
use App\Exceptions\Owner\OwnerRejected;
use App\Exceptions\Requests\RequestAnswerClosed;
use Closure;
use Illuminate\Support\Facades\Config;
use Throwable;

/** The stub scenarios of the owner methods that answer an error (WP-80, "Scenarios"). */
final class OwnerErrors
{
    /**
     * @param  list<string>  $codes
     * @return array<string, Closure(): Throwable>
     */
    public static function of(array $codes): array
    {
        $all = [
            'owner_disabled' => fn (): OwnerCabinetDisabled => new OwnerCabinetDisabled,
            'owner_limit' => fn (): OwnerLimitReached => new OwnerLimitReached('account', Config::integer('owner.limits.listings')),
            'rejected_denied' => fn (): OwnerRejected => new OwnerRejected('denied'),
            'rejected_limit' => fn (): OwnerRejected => new OwnerRejected('limit'),
            'request_answer_closed' => fn (): RequestAnswerClosed => new RequestAnswerClosed,
        ];

        return array_intersect_key($all, array_flip($codes));
    }
}
