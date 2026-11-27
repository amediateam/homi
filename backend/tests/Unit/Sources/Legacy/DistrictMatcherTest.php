<?php

use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\Contracts\ReferenceSource;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\Legacy\Translators\DistrictMatcher;
use App\Services\Sources\SourceContext;
use Tests\Support\LegacyFixtures;

it('matches a district name of the request language to its code', function (string $locale, string $name, ?string $city, ?string $code): void {
    expect((new DistrictMatcher(LegacyFixtures::reference($locale)))->code($name, $city))->toBe($code);
})->with([
    'ru' => ['ru', 'Юнусабад', 'tashkent', 'yunusobod'],
    'uz' => ['uz', 'Yunusobod', 'tashkent', 'yunusobod'],
    'en' => ['en', 'Yunusabad', 'tashkent', 'yunusobod'],
    'case and spaces' => ['ru', '  ЮНУСАБАД ', 'tashkent', 'yunusobod'],
    'a hyphen as a space' => ['ru', 'Мирзо Улугбек', 'tashkent', 'mirzo_ulugbek'],
    'another apostrophe' => ['uz', "Mirzo Ulug'bek", 'tashkent', 'mirzo_ulugbek'],
    'with «район»' => ['ru', 'Юнусабадский район', 'tashkent', 'yunusobod'],
    'the adjective' => ['ru', 'Чиланзарский', 'tashkent', 'chilonzor'],
    'with «tumani»' => ['uz', 'Yunusobod tumani', 'tashkent', 'yunusobod'],
    'a name of its own that ends in «район»' => ['ru', 'Ташкентский район', 'tashkent_region', 'toshkent_tumani'],
    'another city\'s district' => ['ru', 'Чирчик', 'tashkent', null],
    'without a city, every city' => ['ru', 'Чирчик', null, 'chirchiq'],
    'an unknown city reads as every city' => ['ru', 'Кибрай', 'samarkand', 'qibray'],
    'unknown' => ['ru', 'Новый', 'tashkent', null],
    'another language' => ['ru', 'Yunusobod', 'tashkent', null],
]);

it('gives null for a name that two cities give different codes, without a city', function (): void {
    $reference = LegacyFixtures::stub('reference/default.ru');
    $reference['cities'][2]['districts'] = [['code' => 'markaz', 'name' => 'Юнусабад']];
    $matcher = new DistrictMatcher(ReferenceData::fromArray($reference));

    expect($matcher->code('Юнусабад'))->toBeNull()
        ->and($matcher->code('Юнусабад', 'tashkent'))->toBe('yunusobod')
        ->and($matcher->code('Юнусабад', 'andijan'))->toBe('markaz');
});

it('counts the names it could not match, and not an empty name', function (): void {
    $matcher = new DistrictMatcher(LegacyFixtures::reference());
    $matcher->code('Юнусабад', 'tashkent');
    $matcher->code('Новый', 'tashkent');
    $matcher->code('Чирчик', 'tashkent');
    $matcher->code(null);
    $matcher->code(' ');

    expect($matcher->misses())->toBe(2);
});

it('matches nothing, and fails nothing, when the reference source is unavailable (brief rule 16)', function (): void {
    $source = new class implements ReferenceSource
    {
        public function reference(SourceContext $context): ReferenceData
        {
            throw new SourceUnavailable;
        }

        public function cities(SourceContext $context): array
        {
            return [];
        }
    };
    $matcher = DistrictMatcher::fromSource($source, new SourceContext(locale: 'ru', currency: 'USD'));

    expect($matcher->code('Юнусабад', 'tashkent'))->toBeNull()
        ->and($matcher->misses())->toBe(1)
        ->and((new DistrictMatcher(null))->code('Юнусабад'))->toBeNull();
});
