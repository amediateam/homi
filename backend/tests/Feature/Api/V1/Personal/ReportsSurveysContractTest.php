<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

it('answers every reason with hidden, never 204', function (string $reason, bool $hidden): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => $reason])->assertOk()
        ->assertExactJson(['success' => true, 'data' => ['hidden' => $hidden], 'meta' => ['source' => 'stub']]);
})->with([['rented', true], ['agent', false], ['wrong_data', false], ['fraud', true]]);

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
