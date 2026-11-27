<?php

use App\Enums\Personal\FoundAnswerType;
use App\Enums\Personal\FoundPlace;
use App\Enums\Personal\FoundTrigger;
use App\Models\FoundAnswer;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

/*
 * WP-44, step 9: the «Нашли жильё?» survey in HOMI's table (task `KV-BE-044`, API-032, API-033, BR-DATA-032). Every
 * tap is an answer — a row each, not idempotent by design; `where` fills the caller's latest `elsewhere` answer that
 * has no place yet, else it is a row of its own. The wire value `homi` replaces legacy's `kvadro`.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->user = User::factory()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
});

/** @return list<array{int, ?string, ?string, ?string}> the survey rows, oldest first */
function foundRows(): array
{
    return FoundAnswer::query()->orderBy('id')->get()
        ->map(fn (FoundAnswer $row): array => [$row->user_id, $row->answer?->value, $row->trigger?->value, $row->where?->value])
        ->values()->all();
}

it('stores every answer with its trigger, a row per tap', function (string $answer, string $trigger): void {
    $this->postJson('/api/v1/surveys/found', ['answer' => $answer, 'trigger' => $trigger, 'extra' => 1])->assertNoContent()->assertContent('');
    $this->postJson('/api/v1/surveys/found', ['answer' => $answer, 'trigger' => $trigger])->assertNoContent();

    expect(foundRows())->toBe([[$this->user->id, $answer, $trigger, null], [$this->user->id, $answer, $trigger, null]]);
})->with(['homi', 'elsewhere', 'searching', 'stopped'], ['pause', 'delete']);

it('fills where on the caller\'s latest elsewhere answer', function (string $where): void {
    FoundAnswer::factory()->for($this->user)->create(['answer' => FoundAnswerType::Elsewhere, 'trigger' => FoundTrigger::Pause, 'where' => null]);
    $this->postJson('/api/v1/surveys/found', ['answer' => 'elsewhere', 'trigger' => 'delete'])->assertNoContent();

    $this->postJson('/api/v1/surveys/found/where', ['where' => $where])->assertNoContent()->assertContent('');

    expect(foundRows())->toBe([[$this->user->id, 'elsewhere', 'pause', null], [$this->user->id, 'elsewhere', 'delete', $where]]);
})->with(['telegram', 'olx', 'site', 'agent', 'friends', 'street', 'other']);

it('stores a where of its own when the latest elsewhere answer already has one, or there is none', function (): void {
    $this->postJson('/api/v1/surveys/found/where', ['where' => 'olx'])->assertNoContent();
    $this->postJson('/api/v1/surveys/found', ['answer' => 'elsewhere', 'trigger' => 'pause'])->assertNoContent();
    $this->postJson('/api/v1/surveys/found/where', ['where' => 'site'])->assertNoContent();
    $this->postJson('/api/v1/surveys/found/where', ['where' => 'friends'])->assertNoContent();

    expect(foundRows())->toBe([
        [$this->user->id, null, null, 'olx'],
        [$this->user->id, 'elsewhere', 'pause', 'site'],
        [$this->user->id, null, null, 'friends'],
    ]);
});

it('fills the latest elsewhere answer that has no place yet, an older one when the newer is answered', function (): void {
    FoundAnswer::factory()->for($this->user)->create(['answer' => FoundAnswerType::Elsewhere, 'trigger' => FoundTrigger::Pause, 'where' => null]);
    FoundAnswer::factory()->for($this->user)->create(['answer' => FoundAnswerType::Elsewhere, 'trigger' => FoundTrigger::Delete, 'where' => FoundPlace::Olx]);

    $this->postJson('/api/v1/surveys/found/where', ['where' => 'telegram'])->assertNoContent();

    expect(foundRows())->toBe([[$this->user->id, 'elsewhere', 'pause', 'telegram'], [$this->user->id, 'elsewhere', 'delete', 'olx']]);
});

it('fills only an elsewhere answer: a later answer of another kind leaves where on the latest elsewhere', function (): void {
    $this->postJson('/api/v1/surveys/found', ['answer' => 'elsewhere', 'trigger' => 'pause'])->assertNoContent();
    $this->postJson('/api/v1/surveys/found', ['answer' => 'searching', 'trigger' => 'delete'])->assertNoContent();

    $this->postJson('/api/v1/surveys/found/where', ['where' => 'street'])->assertNoContent();

    expect(foundRows())->toBe([[$this->user->id, 'elsewhere', 'pause', 'street'], [$this->user->id, 'searching', 'delete', null]]);
});

it('never fills another user\'s elsewhere answer', function (): void {
    $other = User::factory()->create();
    $theirs = FoundAnswer::factory()->for($other)->create(['answer' => FoundAnswerType::Elsewhere, 'trigger' => FoundTrigger::Pause, 'where' => null]);

    $this->postJson('/api/v1/surveys/found/where', ['where' => 'agent'])->assertNoContent();

    expect($theirs->fresh()?->where)->toBeNull()
        ->and(FoundAnswer::query()->where('user_id', $this->user->id)->sole()->where)->toBe(FoundPlace::Agent);
});

it('refuses unknown survey values with 422 and stores nothing', function (string $path, array $body, string $field): void {
    $this->postJson("/api/v1/{$path}", $body)->assertUnprocessable()->assertJsonValidationErrors([$field]);

    expect(FoundAnswer::query()->count())->toBe(0);
})->with([
    ['surveys/found', ['answer' => 'kvadro', 'trigger' => 'pause'], 'answer'],
    ['surveys/found', ['answer' => 'homi', 'trigger' => 'later'], 'trigger'],
    ['surveys/found', ['answer' => 'homi'], 'trigger'],
    ['surveys/found/where', ['where' => 'newspaper'], 'where'],
    ['surveys/found/where', [], 'where'],
]);

it('answers the 61st survey answer in a minute with 429, the limit of the list writes', function (): void {
    $this->freezeTime();

    foreach (range(1, 60) as $answer) {
        $this->postJson('/api/v1/surveys/found', ['answer' => 'searching', 'trigger' => 'pause'])->assertNoContent();
    }

    $this->postJson('/api/v1/surveys/found/where', ['where' => 'olx'])->assertTooManyRequests()->assertJsonPath('code', 'rate_limited');

    expect(FoundAnswer::query()->count())->toBe(60);
});
