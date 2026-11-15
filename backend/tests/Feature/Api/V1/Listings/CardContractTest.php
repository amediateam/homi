<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
});

/** Base numbers of the stub catalogue (WP-12). */
dataset('catalogue numbers', [100001, 100002, 100003, 100004, 100005, 100006, 100007, 100008, 100009, 100010, 100011, 100012, 100013, 100014, 100015, 100017]);

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

it('masks the raw numbers of the texts down to the last two digits', function (int $number, string $tail): void {
    $data = $this->getJson("/api/v1/listings/{$number}")->assertOk()->json('data');
    $digits = "9980000000{$tail}";

    array_walk_recursive($data, function (mixed $value) use ($digits): void {
        if (is_string($value)) {
            preg_match_all('/\d(?:[ \-.()]{0,2}\d)*/', $value, $runs);

            foreach ($runs[0] as $run) {
                $plain = preg_replace('/\D/', '', $run);
                expect(strlen($plain) >= 7 && str_contains($digits, $plain))->toBeFalse("\"{$value}\" holds the number");
            }
        }
    });

    expect($data['summary'])->toContain("+998 ** *** ** {$tail}")
        ->and($data['original']['text'])->toContain("+998 ** *** ** {$tail}");
})->with([[100001, '67'], [100013, '41']]);

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
