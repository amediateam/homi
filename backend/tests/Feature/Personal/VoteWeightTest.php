<?php

use App\Models\User;
use App\Services\Personal\VoteService;

/*
 * WP-44, step 8: a voter's weight (BR-API-106; `config/votes.php`, a proposal): 1.0, plus 0.5 for Telegram Premium,
 * 0.25 for a username and 0.25 for a profile photo, at most 2.0 — so no single voter reaches a threshold of 3.0.
 */

it('weighs a voter by the profile flags HOMI keeps', function (bool $premium, bool $username, bool $photo, string $weight): void {
    $user = User::factory()->create(['is_premium' => $premium, 'has_username' => $username, 'has_photo' => $photo]);

    expect(app(VoteService::class)->weightOf($user))->toBe($weight);
})->with([
    'no flag' => [false, false, false, '1.00'],
    'a username' => [false, true, false, '1.25'],
    'a photo' => [false, false, true, '1.25'],
    'a username and a photo' => [false, true, true, '1.50'],
    'Premium' => [true, false, false, '1.50'],
    'Premium and a username' => [true, true, false, '1.75'],
    'every flag' => [true, true, true, '2.00'],
]);

it('caps the weight at the configured maximum and reads the values as the config gives them', function (): void {
    config(['votes.weights' => ['base' => 1, 'premium' => 1, 'username' => '0.5', 'photo' => 0.5, 'max' => '2.5']]);
    $user = User::factory()->create(['is_premium' => true, 'has_username' => true, 'has_photo' => true]);

    expect(app(VoteService::class)->weightOf($user))->toBe('2.50');
});

it('never gives a weight below zero or above what the column holds', function (): void {
    config(['votes.weights' => ['base' => -5, 'premium' => 0, 'username' => 0, 'photo' => 0, 'max' => 500]]);
    $low = User::factory()->create();

    expect(app(VoteService::class)->weightOf($low))->toBe('0.00');

    config(['votes.weights.base' => 500]);

    expect(app(VoteService::class)->weightOf($low))->toBe('99.99');
});
