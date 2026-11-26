<?php

use App\Exceptions\Sources\LegacyContractError;
use App\Models\User;
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
 * may be `null` from legacy, and only those (`LegacyFixtures::PREVIEW_GAPS`, `LegacyFixtures::CARD_GAPS`). Everywhere
 * else the two shapes are equal, types included.
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
    $items = [
        ...$translator->page(LegacyFixtures::golden('feed.default'))['items'],
        ...$translator->page(LegacyFixtures::golden('feed.page2'))['items'],
    ];

    expect($items)->toHaveCount(24);

    foreach ($items as $item) {
        $stub = stubPreviewOf($item['number']);

        JsonShape::assertSame(JsonShape::of($stub), JsonShape::of($item));
        JsonShape::assertSame(ContractShapes::LISTING_PREVIEW, JsonShape::of($item));
        expect(LegacyFixtures::nullGaps($stub, $item))->each->toBeIn(LegacyFixtures::PREVIEW_GAPS);
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
    expect(LegacyFixtures::nullGaps($stub, $preview))->each->toBeIn(LegacyFixtures::PREVIEW_GAPS);
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

    expect($legacy['phone'])->toBe('+998901234567')
        ->and($legacy['summary'])->toContain('+998 90 123 45 67')
        ->and($legacy['original_text'])->toContain('+998901234567');

    foreach (['901234567', '90 123 45 67', '90 123-45-67', '123-45-67', '1234567'] as $digits) {
        expect($serialised)->not->toContain($digits);
    }

    expect($card)->not->toHaveKeys(['phone', 'phone_display', 'call_url'])
        ->and($card['summary'])->toContain('+998 ** *** ** 67')
        ->and($card['original']['text'])->toContain('+998 ** *** ** 67')
        ->and($details->summary)->toBe($card['summary'])
        ->and($details->originalText)->toBe($card['original']['text'])
        ->and($card['contact']['has_phone'])->toBeFalse();
});

it('masks the owner\'s own description too, and the masked card masks to itself', function (): void {
    $card = LegacyFixtures::detailsTranslator()->translate(LegacyFixtures::golden('listing.no_phone'));

    expect($card['owner']['description'])->toBe('Без посредников. Звонить после 18:00: +998 ** *** ** 21')
        ->and(json_encode($card, JSON_UNESCAPED_UNICODE))->not->toContain('765 43 21')
        ->and(ListingDetails::fromArray($card)->owner->description)->toBe($card['owner']['description']);
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
