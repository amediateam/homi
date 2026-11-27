<?php

use App\Services\Listings\AuthorKey;
use App\Services\Listings\LinkGuard;
use App\Services\Listings\PhoneMasker;
use App\Services\Sources\Legacy\LegacyListingSource;

/*
 * WP-42 (DEC-52, brief rule 6; review of `ec369f2`, point 3): every frame that takes a raw legacy card, item, event,
 * point or answer of the listing methods, a part or a value of one, or an author-written text, name or link before it
 * is masked marks that parameter `#[\SensitiveParameter]`, so a stack trace of an exception thrown inside it never
 * shows the author's number.
 *
 * The frames are found, not listed: every public, protected and private method declared by the classes under
 * `app/Services/Sources/Legacy/Translators` (`SourceRefParser` among them), `AuthorKey`, `LinkGuard`, `PhoneMasker`
 * and `LegacyListingSource`, and every parameter of one with a name of `SENSITIVE_NAMES` and a built-in type (an
 * array, a string, `mixed`): `$card`, `$legacyCard`, `$answer`, `$item`, `$event`, `$point`, `$option`, `$data`,
 * `$raw`, `$part`, `$value`, `$facts`, `$sources`, `$phone`, `$text`, `$name`, `$link`, `$url` and `$secret`
 * (`$event` and `$raw` name no parameter yet; a later one must carry the attribute). Left out by name: `$number`,
 * `$path`, `$key`, `$city` and the like, which are listing numbers, path templates, field names and codes; and by
 * type: a parameter that takes an object (`SourceManager $sources`). A data object's `fromArray()` takes the
 * translated array and masks it itself; it is not reflected.
 */

/** The parameter names that hold raw legacy data, an unmasked text or a secret. */
const SENSITIVE_NAMES = [
    'card', 'legacyCard', 'answer', 'item', 'event', 'point', 'option', 'data', 'raw', 'part', 'value', 'facts', 'sources',
    'phone', 'text', 'name', 'link', 'url', 'secret',
];

/**
 * The classes whose frames are reflected.
 *
 * @return list<class-string>
 */
function sensitiveFrameClasses(): array
{
    $translators = array_map(
        fn (string $file): string => 'App\\Services\\Sources\\Legacy\\Translators\\'.basename($file, '.php'),
        glob(dirname(__DIR__, 4).'/app/Services/Sources/Legacy/Translators/*.php') ?: [],
    );

    /** @var list<class-string> $classes */
    $classes = [...$translators, AuthorKey::class, LinkGuard::class, PhoneMasker::class, LegacyListingSource::class];

    return $classes;
}

/**
 * Every parameter of a reflected method that must be sensitive, by `Class::method($name)`.
 *
 * @return array<string, ReflectionParameter>
 */
function sensitiveFrames(): array
{
    $frames = [];

    foreach (sensitiveFrameClasses() as $class) {
        foreach ((new ReflectionClass($class))->getMethods() as $method) {
            if ($method->getDeclaringClass()->getName() !== $class) {
                continue;
            }

            foreach ($method->getParameters() as $parameter) {
                $type = $parameter->getType();
                $builtin = ! $type instanceof ReflectionNamedType || $type->isBuiltin();

                if ($builtin && in_array($parameter->getName(), SENSITIVE_NAMES, true)) {
                    $frames[class_basename($class)."::{$method->getName()}(\${$parameter->getName()})"] = $parameter;
                }
            }
        }
    }

    return $frames;
}

it('finds the translators and the masking classes, and enough frames to mean something', function (): void {
    $frames = array_keys(sensitiveFrames());

    expect(sensitiveFrameClasses())->toContain(
        'App\\Services\\Sources\\Legacy\\Translators\\ListingDetailsTranslator',
        'App\\Services\\Sources\\Legacy\\Translators\\SourceRefParser',
        'App\\Services\\Sources\\Legacy\\Translators\\PriceParser',
    )
        ->and(count($frames))->toBeGreaterThanOrEqual(75)
        ->and($frames)->toContain(
            'PriceParser::usdOf($data)',
            'MapPointsTranslator::number($point)',
            'ListingDetailsTranslator::toData($card)',
            'SourceRefParser::fromCard($item)',
            'AuthorKey::derive($secret)',
            'PhoneMasker::lastTwo($phone)',
            'LegacyListingSource::file($card)',
            'LegacyListingSource::file($answer)',
        )
        ->and($frames)->not->toContain('LegacyListingSource::__construct($sources)');
});

it('marks every parameter that holds raw legacy data, an unmasked text or a secret as sensitive', function (): void {
    $unmarked = array_keys(array_filter(
        sensitiveFrames(),
        fn (ReflectionParameter $parameter): bool => $parameter->getAttributes(SensitiveParameter::class) === [],
    ));

    expect($unmarked)->toBe([]);
});
