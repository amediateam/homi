<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
});

/** Base numbers of the stub catalogue (WP-12; 100018 … 100021 are the listing-screen variants of WP-26). */
dataset('catalogue numbers', [100001, 100002, 100003, 100004, 100005, 100006, 100007, 100008, 100009, 100010, 100011, 100012, 100013, 100014, 100015, 100017, 100018, 100019, 100020, 100021]);

/**
 * Every key at any depth of a decoded answer.
 *
 * @return list<string>
 */
function listingKeysOf(array $data): array
{
    $keys = [];

    foreach ($data as $key => $value) {
        $keys[] = (string) $key;

        if (is_array($value)) {
            $keys = [...$keys, ...listingKeysOf($value)];
        }
    }

    return $keys;
}

it('answers the full card in the shape of the contract', function (int $number): void {
    $response = $this->getJson("/api/v1/listings/{$number}")->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::LISTING_DETAILS, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.number', $number)->assertJsonPath('meta.source', 'stub');
})->with('catalogue numbers');

it('answers the preview form with preview=1', function (): void {
    $response = $this->getJson('/api/v1/listings/100012?preview=1')->assertOk();

    expect(array_keys($response->json('data')))->toBe(array_keys(ContractShapes::LISTING_PREVIEW));
});

it('carries no phone number in either form (DEC-52)', function (int $number): void {
    foreach (['', '?preview=1'] as $query) {
        $keys = listingKeysOf($this->getJson("/api/v1/listings/{$number}{$query}")->assertOk()->json());

        expect(array_intersect($keys, ['phone', 'phone_display', 'call_url', 'call_url_expires_at']))->toBe([]);
    }
})->with('catalogue numbers');

it('masks the raw numbers of the texts down to the last two digits', function (int $number, string $tail, array $otherTails): void {
    $data = $this->getJson("/api/v1/listings/{$number}")->assertOk()->json('data');
    $numbers = array_map(fn (string $end): string => "9980000000{$end}", [$tail, ...$otherTails]);

    array_walk_recursive($data, function (mixed $value) use ($numbers): void {
        if (is_string($value)) {
            preg_match_all('/\d(?:[ \-.()]{0,2}\d)*/', $value, $runs);

            foreach ($runs[0] as $run) {
                $plain = preg_replace('/\D/', '', $run);

                foreach ($numbers as $digits) {
                    expect(strlen($plain) >= 7 && str_contains($digits, $plain))->toBeFalse("\"{$value}\" holds the number");
                }
            }
        }
    });

    expect($data['summary'])->toContain("+998 ** *** ** {$tail}")
        ->and($data['original']['text'])->toContain("+998 ** *** ** {$tail}");

    foreach ($otherTails as $other) {
        expect($data['original']['text'])->toContain("+998 ** *** ** {$other}")->not->toContain("000 00 {$other}");
    }
})->with([
    'own number' => [100001, '67', []],
    'own number, suspicious price' => [100013, '41', []],
    'own number and a second one (WP-26)' => [100021, '21', ['99']],
]);

it('carries the WP-26 contact variants', function (int $number, bool $hasPhone, ?string $url, bool $paid, bool $deleted, bool $video): void {
    $this->getJson("/api/v1/listings/{$number}")->assertOk()
        ->assertJsonPath('data.contact.has_phone', $hasPhone)
        ->assertJsonPath('data.contact.contact_url', $url)
        ->assertJsonPath('data.contact.contact_paid', $paid)
        ->assertJsonPath('data.original.deleted', $deleted)
        ->assertJsonPath('data.has_video', $video);
})->with([
    'a chat link without a number' => [100018, false, 'https://t.me/stub_author_7', false, false, false],
    'a paid number' => [100019, false, 'https://t.me/stub_author_8', true, false, false],
    'no contact, the post kept' => [100020, false, null, false, false, false],
    'a video of a deleted post' => [100021, true, 'https://t.me/stub_author_9', false, true, true],
]);

it('carries the WP-26 history, stats, market and author variants', function (): void {
    $single = $this->getJson('/api/v1/listings/100018')->assertOk()->json('data');
    $near = $this->getJson('/api/v1/listings/100019')->assertOk()->json('data');
    $city = $this->getJson('/api/v1/listings/100020')->assertOk()->json('data');
    $video = $this->getJson('/api/v1/listings/100021')->assertOk()->json('data');

    expect($single['price_history'])->toHaveCount(1)
        ->and($single['stats'])->toBe(['days_listed' => 0, 'publications' => 1, 'channels' => 1, 'views' => null])
        ->and($single['offers'])->toBe([['text' => 'Торг', 'url' => 'https://t.me/stub_channel_c/5018']])
        ->and($single['author'])->toBe(['kind' => 'source', 'label' => 'stub_channel_c', 'count' => 1])
        ->and($single['comparison'])->toBeNull()
        ->and(array_column($near['price_history'], 'kind'))->toBe(['published', 'price_up', 'price_down'])
        ->and(array_column($near['price_history'], 'change_pct'))->toEqual([null, 5.0, -3.3])
        ->and($near['stats']['views'])->toBe(0)
        ->and($near['comparison'])->toMatchArray(['scope' => 'near', 'near_class' => 'jk', 'radius_km' => 0.34, 'note' => 'Цена выше похожих рядом — уточните условия'])
        ->and($near['market']['tone'])->toBe('check')
        ->and($city['comparison'])->toMatchArray(['scope' => 'city', 'near_class' => null, 'radius_km' => null])
        ->and($city['market']['tone'])->toBe('good')
        ->and($video['author'])->toBe(['kind' => 'phone', 'label' => '+998 ** *** ** 21', 'count' => 24]);
});

it('compares the per-m² listings in per-m² values', function (int $number, float $value, float $own): void {
    $comparison = $this->getJson("/api/v1/listings/{$number}")->assertOk()->json('data.comparison');

    expect($comparison['metric'])->toBe('m2')
        ->and($comparison['value'])->toEqual($value)
        ->and($comparison['own'])->toEqual($own)
        ->and($comparison['own'])->toEqual($comparison['price_per_m2']);
})->with([[100008, 1122.44, 1089.74], [100009, 563.06, 625.0]]);

it('answers a merged duplicate with the surviving number', function (): void {
    $this->getJson('/api/v1/listings/100016')->assertOk()->assertJsonPath('data.number', 100001);
});

it('marks the withdrawn listing', function (): void {
    $this->getJson('/api/v1/listings/100015')->assertOk()
        ->assertJsonPath('data.status_text', 'Снято с публикации')
        ->assertJsonPath('data.contact.has_phone', false)
        ->assertJsonPath('data.contact.contact_url', null)
        ->assertJsonPath('data.original.deleted', true);
});

it('keeps the price kinds of the catalogue', function (int $number, string $kind): void {
    $this->getJson("/api/v1/listings/{$number}")->assertOk()->assertJsonPath('data.price.kind', $kind);
})->with([[100008, 'down_payment'], [100004, 'business']]);

it('answers the reserved numbers and malformed numbers', function (string $number, int $status, string $code): void {
    $this->getJson("/api/v1/listings/{$number}")->assertStatus($status)->assertJsonPath('code', $code);
})->with([
    ['999404', 404, 'not_found'], ['999503', 503, 'source_unavailable'], ['123456', 404, 'not_found'],
    ['abc', 404, 'not_found'], ['0', 404, 'not_found'], ['-1', 404, 'not_found'],
]);
