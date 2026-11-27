<?php

use App\Exceptions\Sources\LegacyContractError;
use App\Models\User;
use App\Services\Listings\PhoneMasker;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Legacy\Translators\FlowTranslator;
use App\Services\Sources\Legacy\Translators\ListingDetailsTranslator;
use App\Services\Sources\Legacy\Translators\ListingSummaryTranslator;
use App\Services\Sources\Legacy\Translators\MapPointsTranslator;
use App\Services\Sources\Legacy\Translators\NewCountTranslator;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;
use Tests\Support\LegacyFixtures;

/*
 * RK-26 for the listing methods (WP-42): every golden fixture (`resources/fixtures/legacy/README.md`) translates into
 * the shape of WP-12's stub answer for the same listing. A legacy release that changes a shape changes its fixture,
 * and a translator that no longer fits fails here, naming the field.
 *
 * The stub has a value in a few places legacy cannot fill (the spec's "Gaps against legacy"; brief rule 12): those
 * may be `null` from legacy, and only those (`LegacyFixtures::previewGaps()`: `price.usd` and `posted.at` only for an
 * item without `usd` or `posted_at`; `LegacyFixtures::CARD_GAPS`). Everywhere else the two shapes are equal, types
 * included. The shapes cannot see a renamed key whose empty value fits the stub's type: the key test at the end can.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
});

/**
 * The preview part of a stub catalogue entry: what a feed item and `?preview=1` answer.
 *
 * @return array<array-key, mixed>
 */
function stubPreviewOf(int $number): array
{
    $entry = LegacyFixtures::stubListing($number);
    $preview = array_intersect_key($entry, ContractShapes::LISTING_PREVIEW);
    unset($preview['photos']['items'], $preview['market']['code']);

    return $preview;
}

/** The v1 card contract without `owner.entry`, which the source writes per caller (DEC-94), never the translator. */
function cardContract(): array
{
    $contract = ContractShapes::LISTING_DETAILS;
    unset($contract['owner']['entry']);

    return $contract;
}

it('translates every feed item into the preview shape of its stub listing', function (): void {
    $translator = LegacyFixtures::summaryTranslator();
    $legacy = [...LegacyFixtures::golden('feed.default')['items'], ...LegacyFixtures::golden('feed.page2')['items']];
    $items = [
        ...$translator->page(LegacyFixtures::golden('feed.default'))['items'],
        ...$translator->page(LegacyFixtures::golden('feed.page2'))['items'],
    ];

    expect($items)->toHaveCount(24);

    foreach ($items as $index => $item) {
        $stub = stubPreviewOf($item['number']);

        JsonShape::assertSame(JsonShape::of($stub), JsonShape::of($item));
        JsonShape::assertSame(ContractShapes::LISTING_PREVIEW, JsonShape::of($item));
        expect(LegacyFixtures::nullGaps($stub, $item))->each->toBeIn(LegacyFixtures::previewGaps($legacy[$index]));
    }
});

it('keeps the legacy cursor of a page and ends the list on the last one', function (): void {
    $translator = LegacyFixtures::summaryTranslator();

    expect($translator->page(LegacyFixtures::golden('feed.default'))['next_cursor'])->toBe('fixture-cursor-page-2')
        ->and($translator->page(LegacyFixtures::golden('feed.page2'))['next_cursor'])->toBeNull()
        ->and($translator->page(LegacyFixtures::golden('feed.empty')))->toBe(['items' => [], 'next_cursor' => null]);
});

it('translates the preview form into the preview shape of its stub listing', function (): void {
    $preview = LegacyFixtures::summaryTranslator()->translate(LegacyFixtures::golden('listing.preview'), path: ListingDetailsTranslator::PATH);
    $stub = stubPreviewOf(100001);

    JsonShape::assertSame(JsonShape::of($stub), JsonShape::of($preview));
    expect(LegacyFixtures::nullGaps($stub, $preview))->each->toBeIn(LegacyFixtures::previewGaps(LegacyFixtures::golden('listing.preview')));
});

it('translates every golden card into the card shape of its stub listing', function (string $fixture, int $number): void {
    $card = LegacyFixtures::detailsTranslator()->translate(LegacyFixtures::golden($fixture));
    $stub = LegacyFixtures::stubListing($number);

    expect($card['number'])->toBe($number);
    JsonShape::assertSame(JsonShape::of($stub), JsonShape::of($card));
    JsonShape::assertSame(cardContract(), JsonShape::of($card));
    expect(LegacyFixtures::nullGaps($stub, $card))->each->toBeIn(LegacyFixtures::CARD_GAPS);
})->with([
    'rent apartment' => ['listing.rent_apartment', 100001],
    'daily, absolute photo addresses' => ['listing.daily', 100005],
    'sale house' => ['listing.sale_house', 100009],
    'commercial, business price' => ['listing.commercial', 100004],
    'land without a district' => ['listing.land', 100011],
    'merged duplicate answers 100001' => ['listing.merged', 100001],
    'self-placed gate listing without a phone' => ['listing.no_phone', 100024],
    'a call link without a phone (variant B)' => ['listing.link_only', 100002],
]);

it('translates a card with only the required keys into nulls and empty values, not errors', function (): void {
    $card = LegacyFixtures::detailsTranslator()->translate(LegacyFixtures::golden('listing.minimal'));

    JsonShape::assertSame(cardContract(), JsonShape::of($card));
    expect($card)->toMatchArray([
        'number' => 100014, 'deal' => null, 'type' => null, 'title' => '', 'price' => null, 'floor' => null, 'district' => null,
        'location' => null, 'photos' => ['preview' => [], 'count' => 0, 'cover' => null, 'items' => []],
        'posted' => ['label' => '', 'when' => '', 'at' => null], 'is_owner' => null, 'source_ref' => null,
        'stats' => ['days_listed' => 0, 'publications' => 0, 'channels' => 0, 'views' => null],
        'author' => null, 'owner_label' => null, 'comparison' => null, 'facts' => [], 'nearby' => [], 'price_history' => [],
        'contact' => ['has_phone' => false, 'contact_url' => null, 'contact_paid' => false, 'mode' => null, 'request' => null],
        'original' => ['text' => null, 'url' => null, 'deleted' => false],
        'owner' => ['tier' => null, 'mine' => false, 'listing_id' => null, 'response_minutes' => null, 'description' => null],
    ]);
});

it('translates the counts, the flow and the map into their v1 shapes', function (): void {
    expect(NewCountTranslator::count(LegacyFixtures::golden('count'), NewCountTranslator::COUNT_PATH))->toBe(24)
        ->and(NewCountTranslator::count(LegacyFixtures::golden('feed_new')))->toBe(12);

    foreach (['flow', 'flow.options'] as $fixture) {
        JsonShape::assertSame(ContractShapes::FLOW, JsonShape::of(FlowTranslator::translate(LegacyFixtures::golden($fixture))));
    }

    $map = MapPointsTranslator::translate(LegacyFixtures::golden('map'), LegacyFixtures::NATIVE_FLOOR);
    JsonShape::assertSame(ContractShapes::MAP, JsonShape::of($map));
    expect([count($map['points']), $map['with_point'], $map['total']])->toBe([23, 23, 24]);
});

it('answers the flow and the map in the shape the stub driver answers them', function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
    $stubFlow = $this->getJson('/api/v1/listings/flow?city=tashkent&deal=sale')->assertOk()->json('data');
    $stubMap = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_long')->assertOk()->json('data');

    JsonShape::assertSame(JsonShape::of($stubFlow), JsonShape::of(FlowTranslator::translate(LegacyFixtures::golden('flow.options'))));
    JsonShape::assertSame(JsonShape::of($stubMap), JsonShape::of(MapPointsTranslator::translate(LegacyFixtures::golden('map'), LegacyFixtures::NATIVE_FLOOR)));
});

it('fails naming the key when a required key disappears from a legacy answer', function (string $fixture, string $key, Closure $translate, string $path): void {
    try {
        $translate(LegacyFixtures::without(LegacyFixtures::golden($fixture), $key));
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe([$key])
            ->and($error->path)->toBe($path);

        return;
    }

    throw new LogicException("Removing {$key} from {$fixture} did not fail the translation.");
})->with([
    'feed items' => ['feed.default', 'items', fn (array $answer) => LegacyFixtures::summaryTranslator()->page($answer), ListingSummaryTranslator::PATH],
    'feed next_cursor' => ['feed.default', 'next_cursor', fn (array $answer) => LegacyFixtures::summaryTranslator()->page($answer), ListingSummaryTranslator::PATH],
    'feed item id' => ['feed.default', 'items.0.id', fn (array $answer) => LegacyFixtures::summaryTranslator()->page($answer), ListingSummaryTranslator::PATH],
    'feed item photos_preview' => ['feed.page2', 'items.3.photos_preview', fn (array $answer) => LegacyFixtures::summaryTranslator()->page($answer), ListingSummaryTranslator::PATH],
    'count' => ['count', 'count', fn (array $answer) => NewCountTranslator::count($answer, NewCountTranslator::COUNT_PATH), NewCountTranslator::COUNT_PATH],
    'new-since count' => ['feed_new', 'count', fn (array $answer) => NewCountTranslator::count($answer), NewCountTranslator::PATH],
    'flow week' => ['flow', 'week', fn (array $answer) => FlowTranslator::translate($answer), FlowTranslator::PATH],
    'flow days' => ['flow.options', 'days', fn (array $answer) => FlowTranslator::translate($answer), FlowTranslator::PATH],
    'map points' => ['map', 'points', fn (array $answer) => MapPointsTranslator::translate($answer, LegacyFixtures::NATIVE_FLOOR), MapPointsTranslator::PATH],
    'card id' => ['listing.rent_apartment', 'id', fn (array $answer) => LegacyFixtures::detailsTranslator()->translate($answer), ListingDetailsTranslator::PATH],
    'card photos' => ['listing.rent_apartment', 'photos', fn (array $answer) => LegacyFixtures::detailsTranslator()->translate($answer), ListingDetailsTranslator::PATH],
    'card facts' => ['listing.minimal', 'facts', fn (array $answer) => LegacyFixtures::detailsTranslator()->translate($answer), ListingDetailsTranslator::PATH],
    'card sources' => ['listing.no_phone', 'sources', fn (array $answer) => LegacyFixtures::detailsTranslator()->translate($answer), ListingDetailsTranslator::PATH],
]);

it('leaves no digit of the author\'s number in a card: the phone keys are dropped and the texts masked', function (): void {
    $legacy = LegacyFixtures::golden('listing.rent_apartment');
    $card = LegacyFixtures::detailsTranslator()->translate($legacy);
    $details = ListingDetails::fromArray($card);
    $serialised = json_encode([$card, $details], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    expect($legacy['phone'])->toBe('+998001234567')
        ->and($legacy['summary'])->toContain('+998 00 123 45 67')
        ->and($legacy['original_text'])->toContain('+998001234567');

    foreach (['001234567', '00 123 45 67', '00 123-45-67', '123-45-67', '1234567'] as $digits) {
        expect($serialised)->not->toContain($digits);
    }

    expect($card)->not->toHaveKeys(['phone', 'phone_display', 'call_url'])
        ->and($card['summary'])->toContain('+998 ** *** ** 67')
        ->and($card['original']['text'])->toContain('+998 ** *** ** 67')
        ->and($details->summary)->toBe($card['summary'])
        ->and($details->originalText)->toBe($card['original']['text'])
        ->and($card['contact']['has_phone'])->toBeTrue();
});

it('masks the owner\'s own description too, and the masked card masks to itself', function (): void {
    $card = LegacyFixtures::detailsTranslator()->translate(LegacyFixtures::golden('listing.no_phone'));

    expect($card['owner']['description'])->toBe('Без посредников. Звонить после 18:00: +998 ** *** ** 21')
        ->and(json_encode($card, JSON_UNESCAPED_UNICODE))->not->toContain('765 43 21')
        ->and(ListingDetails::fromArray($card)->owner->description)->toBe($card['owner']['description']);
});

it('writes every phone number of the legacy fixtures with the synthetic code 00, never an operator\'s', function (): void {
    $prefixed = '/(?<!\d)(?:\+?998|8)[ \-.()]{0,2}(\d{2})[ \-.()]{0,2}\d{3}[ \-.()]{0,2}\d{2}[ \-.()]{0,2}\d{2}(?!\d)/';
    $real = [];

    foreach (glob(resource_path('fixtures/legacy').'/{,errors/}*.json', GLOB_BRACE) ?: [] as $file) {
        // Photo signatures (32 hex characters) and link expiries (`?e=1795132800`): the masker would read their digit runs
        // as numbers, and a link with nine digits in a row as a link that may carry one.
        $text = (string) preg_replace('/\b[0-9a-f]{32}\b|(?<=[?&]e=)\d+/', '', (string) file_get_contents($file));
        preg_match_all($prefixed, $text, $numbers);
        $withoutSynthetic = (string) preg_replace_callback($prefixed, fn (array $number): string => $number[1] === '00' ? '' : $number[0], $text);

        foreach ($numbers[1] as $code) {
            if ($code !== '00') {
                $real[] = basename($file).": +998 {$code} …";
            }
        }

        if (PhoneMasker::mask($withoutSynthetic) !== $withoutSynthetic) {
            $real[] = basename($file).': a number with an operator code and no prefix';
        }
    }

    expect($real)->toBe([]);
});

it('points every photo of the translated fixtures at HOMI\'s media host in the form the client derives the small variant from', function (): void {
    $summary = LegacyFixtures::summaryTranslator();
    $details = LegacyFixtures::detailsTranslator();
    $photos = [];

    foreach ([...$summary->page(LegacyFixtures::golden('feed.default'))['items'], ...$summary->page(LegacyFixtures::golden('feed.page2'))['items']] as $item) {
        $photos = [...$photos, ...$item['photos']['preview'], ...array_filter([$item['photos']['cover']])];
    }

    foreach (['listing.rent_apartment', 'listing.daily', 'listing.sale_house', 'listing.commercial', 'listing.land', 'listing.no_phone'] as $fixture) {
        $photos = [...$photos, ...$details->translate(LegacyFixtures::golden($fixture))['photos']['items']];
    }

    expect($photos)->not->toBeEmpty()
        ->each->toMatch('~^'.preg_quote(LegacyFixtures::MEDIA, '~').'/\d+/\d+\.jpg\?e=\d+&s=[0-9a-f]{32}$~');
});

/*
 * A renamed key passes the shape checks above when the translator's empty value (`''`, `false`, `0`, `null`) fits the
 * stub's type. So every key a golden fixture carries must matter: deleting it (from every item of a list, `items.*.age`)
 * must change the translation of at least one fixture of its translator, or fail it with a contract error. A key no
 * translator reads is listed in `UNREAD_LEGACY_KEYS` with its reason; a legacy release that renames a key re-records
 * the fixtures, and the new name fails here until a translator reads it.
 */

/** Keys of the golden fixtures that no translator reads, on purpose. */
const UNREAD_LEGACY_KEYS = [
    'favorite', 'viewed', // legacy's flags for the service key: HOMI's overlay writes them (WP-42)
    // Never mapped into a card (DEC-52): `phone` and `call_url` only decide `contact.has_phone` (WP-43; every card with a
    // phone also has a call link, so deleting one changes nothing; `listing.link_only` pins the link) and `phone` the mode
    // of a gate listing; `phone_display` is read by the contact method only.
    'phone', 'phone_display', 'call_url',
    'owner_mine', 'owner_listing_id', 'my_request', 'owner_entry', // per user under a service key: the overlay's (DEC-94)
    'title', 'short_title', // read as a pair: `short_title`, else `title` before « · »; deleted together below
    'total', 'photos_total', // `FeedPage.total` and `ListingPreview.photos_total`: never read by the client (`08` §1.8)
];

/** Keys one translator reads only as a bound: on a card `photos` lists every photo, so `photos_count` only caps it. */
const UNREAD_CARD_KEYS = ['photos_count'];

/**
 * The golden fixtures of each translator, translated by one closure; a key's deletion must change one of them.
 *
 * @return array<string, array{fixtures: list<string>, translate: Closure(array<array-key, mixed>): mixed, unread: list<string>}>
 */
function translatorFixtures(): array
{
    return [
        'card' => [
            'fixtures' => ['listing.rent_apartment', 'listing.daily', 'listing.sale_house', 'listing.commercial', 'listing.land', 'listing.merged', 'listing.no_phone', 'listing.link_only', 'listing.minimal'],
            'translate' => fn (array $answer): array => LegacyFixtures::detailsTranslator()->translate($answer),
            'unread' => [...UNREAD_LEGACY_KEYS, ...UNREAD_CARD_KEYS],
        ],
        'preview' => [
            'fixtures' => ['feed.default', 'feed.page2', 'feed.empty', 'listing.preview'],
            'translate' => fn (array $answer): array => array_key_exists('items', $answer) || array_key_exists('next_cursor', $answer)
                ? LegacyFixtures::summaryTranslator()->page($answer)
                : LegacyFixtures::summaryTranslator()->translate($answer, path: ListingDetailsTranslator::PATH),
            'unread' => UNREAD_LEGACY_KEYS,
        ],
        'map' => [
            'fixtures' => ['map'],
            'translate' => fn (array $answer): array => MapPointsTranslator::translate($answer, LegacyFixtures::NATIVE_FLOOR),
            'unread' => [],
        ],
        'flow' => [
            'fixtures' => ['flow', 'flow.options'],
            'translate' => fn (array $answer): array => FlowTranslator::translate($answer),
            'unread' => [],
        ],
        'count' => [
            'fixtures' => ['count', 'feed_new'],
            'translate' => fn (array $answer): int => NewCountTranslator::count($answer),
            'unread' => [],
        ],
    ];
}

/**
 * Every (translator, key) of the golden fixtures, the items of a feed page read as previews (`items.*.age` as `age`
 * of the preview group's universe). The keys of flow filters are `FiltersTranslatorTest`'s, one per filter.
 *
 * @return array<string, array{string, string}>
 */
function goldenKeys(): array
{
    $cases = [];

    foreach (translatorFixtures() as $translator => ['fixtures' => $fixtures, 'unread' => $unread]) {
        foreach ($fixtures as $fixture) {
            foreach (LegacyFixtures::keyPaths(LegacyFixtures::golden($fixture)) as $path) {
                $key = (string) preg_replace('/^items\.\*\./', '', $path);

                if (! in_array(explode('.', $key)[0], $unread, true) && ! str_contains($key, 'filters.')) {
                    $cases["{$translator}: {$key}"] = [$translator, $key];
                }
            }
        }
    }

    $cases['card: title with short_title'] = ['card', 'title+short_title'];
    $cases['preview: title with short_title'] = ['preview', 'title+short_title'];

    return $cases;
}

it('reads every key of the golden fixtures: deleting one changes a translation or fails it', function (string $translator, string $key): void {
    ['fixtures' => $fixtures, 'translate' => $translate] = translatorFixtures()[$translator];
    $changed = false;

    foreach ($fixtures as $fixture) {
        $answer = LegacyFixtures::golden($fixture);
        $mutated = $answer;

        foreach (explode('+', $key) as $part) {
            $mutated = LegacyFixtures::withoutEvery($mutated, array_key_exists('items', $answer) && ! in_array($part, ['items', 'next_cursor'], true) ? "items.*.{$part}" : $part);
        }

        if ($mutated === $answer) {
            continue;
        }

        try {
            $changed = $translate($mutated) !== $translate($answer);
        } catch (LegacyContractError) {
            $changed = true;
        }

        if ($changed) {
            break;
        }
    }

    expect($changed)->toBeTrue("Deleting \"{$key}\" changes no {$translator} fixture's translation: legacy renamed it, a fixture holds only its empty value, or no translator reads it any more (then list it as unread, with the reason).");
})->with(goldenKeys());
