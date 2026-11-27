<?php

namespace App\Services\Personal;

use App\Enums\Personal\FoundAnswerType;
use App\Enums\Personal\FoundPlace;
use App\Enums\Personal\FoundTrigger;
use App\Models\FoundAnswer;
use App\Models\User;

/**
 * The «Нашли жильё?» survey (WP-44; task `KV-BE-044`, API-032, API-033, BR-DATA-032): statistics, not state. Every tap
 * is an answer, so `answer()` inserts a row each time (not idempotent by design). `where()` answers the user's latest
 * `elsewhere` row: it fills that row while it has no place yet, else — or without any `elsewhere` row — it inserts a
 * row with only `where`; an older `elsewhere` row is never filled. The fill is one conditional update, so two taps at
 * once fill the row once and the other becomes a row of its own. The bot's poll (WP-53) writes through the same methods.
 */
final readonly class FoundSurveyService
{
    public function answer(User $user, FoundAnswerType $answer, FoundTrigger $trigger): void
    {
        $user->foundAnswers()->create(['answer' => $answer, 'trigger' => $trigger]);
    }

    public function where(User $user, FoundPlace $place): void
    {
        $latest = $user->foundAnswers()->where('answer', FoundAnswerType::Elsewhere->value)->max('id');
        $filled = is_numeric($latest)
            ? FoundAnswer::query()->whereKey((int) $latest)->whereNull('where')->update(['where' => $place->value])
            : 0;

        if ($filled === 0) {
            $user->foundAnswers()->create(['where' => $place]);
        }
    }
}
