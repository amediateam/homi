<?php

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

/*
 * The reports and the «Нашли жильё?» survey of WP-13 as the native stubs answer them (WP-44, brief decision 10): while
 * `sources.native_stubs` is on, `NativeStubs` answers the stub bodies and stores nothing, as the end-to-end suite
 * expects (`listing-actions.spec.ts`, `journeys/moderation.spec.ts`, `radar-forms.spec.ts`,
 * `journeys/search-to-radar.spec.ts`); `ReportsTest` and `FoundSurveyTest` cover the real methods.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    config(['sources.native_stubs' => true]);
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

it('answers every reason with hidden and agent_marked, never 204', function (string $reason, bool $hidden): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => $reason])->assertOk()
        ->assertExactJson(['success' => true, 'data' => ['hidden' => $hidden, 'agent_marked' => false], 'meta' => ['source' => 'stub']]);
})->with([['rented', true], ['agent', false], ['wrong_data', false], ['fraud', true]]);

it('marks the author in the agent_marked scenario, and only for an agent report', function (string $reason, bool $marked): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => $reason], ['X-Stub-Scenario' => 'agent_marked'])->assertOk()
        ->assertJsonPath('data.agent_marked', $marked);
})->with([['agent', true], ['rented', false], ['wrong_data', false], ['fraud', false]]);

it('accepts wrong_data with each detail, without one, and with a null detail', function (?string $detail): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'wrong_data', 'detail' => $detail])->assertOk()->assertJsonPath('data.hidden', false);
})->with(['price', 'rooms', 'place', 'photos', 'other', null]);

it('refuses a report it cannot read, naming the field', function (array $body, string $field): void {
    $this->postJson('/api/v1/listings/100012/reports', $body)->assertStatus(422)->assertJsonValidationErrors([$field]);
})->with([
    'unknown reason' => [['reason' => 'spam'], 'reason'],
    'missing body' => [[], 'reason'],
    'unknown detail' => [['reason' => 'wrong_data', 'detail' => 'floor'], 'detail'],
    'detail with rented' => [['reason' => 'rented', 'detail' => 'price'], 'detail'],
    'detail with agent' => [['reason' => 'agent', 'detail' => 'other'], 'detail'],
    'detail with fraud' => [['reason' => 'fraud', 'detail' => 'photos'], 'detail'],
]);

it('reports only listings that exist', function (): void {
    $this->postJson('/api/v1/listings/999404/reports', ['reason' => 'rented'])->assertStatus(404)->assertJsonPath('code', 'not_found');
    $this->postJson('/api/v1/listings/0/reports', ['reason' => 'rented'])->assertStatus(404);
});

it('withdraws the rented report with 204 and no body, also when there is none left', function (): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'rented'])->assertOk();

    $this->deleteJson('/api/v1/listings/100012/reports')->assertNoContent();
    $this->deleteJson('/api/v1/listings/100012/reports')->assertNoContent();
});

it('withdraws a report only from a listing that exists', function (string $number, int $status, string $code): void {
    $this->deleteJson("/api/v1/listings/{$number}/reports")->assertStatus($status)->assertJsonPath('code', $code);
})->with([
    'unknown listing' => ['999404', 404, 'not_found'],
    'number 0' => ['0', 404, 'not_found'],
    'malformed number' => ['abc', 404, 'not_found'],
    'unavailable source' => ['999503', 503, 'source_unavailable'],
]);

it('answers 401 unauthenticated to a withdrawal without a token', function (): void {
    $this->app['auth']->forgetGuards();

    $this->withHeader('Authorization', '')->deleteJson('/api/v1/listings/100012/reports')
        ->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
});

it('answers 403 forbidden to a withdrawal with a token that lacks app:write', function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);

    $this->deleteJson('/api/v1/listings/100012/reports')->assertForbidden()->assertJsonPath('code', 'forbidden');
});

it('records a found-survey answer with its trigger', function (string $answer, string $trigger): void {
    $this->postJson('/api/v1/surveys/found', ['answer' => $answer, 'trigger' => $trigger, 'extra' => 1])->assertNoContent();
})->with(['homi', 'elsewhere', 'searching', 'stopped'], ['pause', 'delete']);

it('records where the home was found', function (string $where): void {
    $this->postJson('/api/v1/surveys/found/where', ['where' => $where])->assertNoContent();
})->with(['telegram', 'olx', 'site', 'agent', 'friends', 'street', 'other']);

it('refuses unknown survey values', function (string $path, array $body, string $field): void {
    $this->postJson("/api/v1/{$path}", $body)->assertStatus(422)->assertJsonValidationErrors([$field]);
})->with([
    ['surveys/found', ['answer' => 'kvadro', 'trigger' => 'pause'], 'answer'],
    ['surveys/found', ['answer' => 'homi', 'trigger' => 'later'], 'trigger'],
    ['surveys/found', ['answer' => 'homi'], 'trigger'],
    ['surveys/found/where', ['where' => 'newspaper'], 'where'],
    ['surveys/found/where', [], 'where'],
]);
