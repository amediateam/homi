<?php

use Illuminate\Support\Facades\Http;
use Tests\Support\EnvOverride;

/*
 * WP-45: `config/radar.php` reads its four environment keys only there, and a blank value is the safe default, as if
 * the key were absent (lesson 4 of the brief): `max` 10, and the three switches off. `.env.example` lists the keys of
 * the servers with blank values, and `env()` answers `''` for `KEY=`, which a plain `(int)` cast reads as 0.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
});

/** @return array<string, mixed> the configuration with one environment key set to the value, or unset */
function radarConfigWith(string $key, ?string $value): array
{
    return EnvOverride::with($key, $value, fn (): array => require config_path('radar.php'));
}

it('reads the safe default of each key when it is unset or blank', function (string $key, string $config, mixed $default): void {
    foreach ([null, '', '   '] as $value) {
        expect(radarConfigWith($key, $value)[$config])->toBe($default);
    }
})->with([
    'RADAR_MAX' => ['RADAR_MAX', 'max', 10],
    'RADAR_CREATION_ENABLED' => ['RADAR_CREATION_ENABLED', 'creation_enabled', false],
    'RADAR_REQUIRE_CHAT' => ['RADAR_REQUIRE_CHAT', 'require_chat', false],
    'RADAR_STARTER_ENABLED' => ['RADAR_STARTER_ENABLED', 'starter_enabled', false],
]);

it('reads a positive whole limit and nothing else', function (string $value, int $max): void {
    expect(radarConfigWith('RADAR_MAX', $value)['max'])->toBe($max);
})->with([
    'five' => ['5', 5],
    'twenty with spaces' => [' 20 ', 20],
    'zero' => ['0', 10],
    'negative' => ['-3', 10],
    'a fraction' => ['2.5', 10],
    'a word' => ['ten', 10],
]);

it('reads the switches as booleans', function (string $key, string $config): void {
    expect(radarConfigWith($key, 'true')[$config])->toBeTrue()
        ->and(radarConfigWith($key, '1')[$config])->toBeTrue()
        ->and(radarConfigWith($key, 'false')[$config])->toBeFalse()
        ->and(radarConfigWith($key, 'no')[$config])->toBeFalse()
        ->and(radarConfigWith($key, 'maybe')[$config])->toBeFalse();
})->with([
    ['RADAR_CREATION_ENABLED', 'creation_enabled'],
    ['RADAR_REQUIRE_CHAT', 'require_chat'],
    ['RADAR_STARTER_ENABLED', 'starter_enabled'],
]);

it('has every key of the design with its type', function (): void {
    $config = require config_path('radar.php');

    expect(array_keys($config))->toBe([
        'max', 'max_total', 'creation_enabled', 'limit_scope', 'require_chat', 'starter_enabled', 'starter_window_days', 'starter_max',
        'options_max', 'preview_ttl', 'preview_budget_ms', 'preview_max_rounds', 'author_hide_rules', 'found_cooldown_days',
    ])
        ->and($config['max_total'])->toBe(50)
        ->and($config['limit_scope'])->toBe('active')
        ->and($config['starter_window_days'])->toBe(3)
        ->and($config['starter_max'])->toBe(20)
        ->and($config['options_max'])->toBe(5)
        ->and($config['preview_ttl'])->toBe(120)
        ->and($config['preview_budget_ms'])->toBe(4000)
        ->and($config['preview_max_rounds'])->toBe(10)
        ->and($config['author_hide_rules'])->toBeFalse()
        ->and($config['found_cooldown_days'])->toBe(30);
});
