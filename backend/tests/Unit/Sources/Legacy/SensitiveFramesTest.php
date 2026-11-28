<?php

use App\Exceptions\TelegramException;
use App\Http\Controllers\Pages\CallPageController;
use App\Services\Listings\AuthorKey;
use App\Services\Listings\CallLink;
use App\Services\Listings\CallLinkClaims;
use App\Services\Listings\CallLinkService;
use App\Services\Listings\ContactDisclosure;
use App\Services\Listings\ContactService;
use App\Services\Listings\LinkGuard;
use App\Services\Listings\PhoneMasker;
use App\Services\Listings\TranslationService;
use App\Services\Personal\AuthorLabel;
use App\Services\Personal\BlockedAuthorService;
use App\Services\Sources\Data\ListingTranslation;
use App\Services\Sources\Legacy\LegacyContact;
use App\Services\Sources\Legacy\LegacyListingSource;
use App\Services\Telegram\PreparedShare;
use App\Services\Telegram\ShareService;
use App\Services\Telegram\TelegramClient;

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
 * (`$event` and `$raw` name no parameter yet; a later one must carry the attribute). WP-43 adds `$token` (a call
 * token) and `$display` (the display of an author's number), and the classes of the contact: `LegacyContact`,
 * `ContactService`, `ContactDisclosure`, `CallLinkService`, `CallLink`, `CallLinkClaims` and `CallPageController`;
 * its stage B the classes of the translation and the share: `TranslationService`, `ListingTranslation` (whose
 * `fromArray()` takes legacy's translated text before it is masked), `TelegramClient` (`$token`, the bot token),
 * `TelegramException`, `ShareService` and `PreparedShare`, and the name `$telegramId` (a caller's Telegram id, which
 * no log line or trace shows); the re-review the name `$params` (the body of a Bot API call: a Telegram id and a
 * listing's text). `TelegramClient::result()`'s `$response` takes an object, so `ShareServiceTest` checks it by what a
 * trace of it would show. WP-44 adds the classes of a blocked author's label, `AuthorLabel` and `BlockedAuthorService`,
 * and the name `$sourceLabel` (an author's label as the source wrote it, before it is masked again).
 * Left out by name: `$number`,
 * `$path`, `$key`, `$city` and the like, which are listing numbers, path templates, field names and codes; and by
 * type: a parameter that takes an object (`SourceManager $sources`). A data object's `fromArray()` takes the
 * translated array and masks it itself; it is not reflected.
 */

/** The parameter names that hold raw legacy data, an unmasked text or a secret. */
const SENSITIVE_NAMES = [
    'card', 'legacyCard', 'answer', 'item', 'event', 'point', 'option', 'data', 'raw', 'part', 'value', 'facts', 'sources',
    'phone', 'text', 'name', 'link', 'url', 'secret', 'token', 'display', 'telegramId', 'params', 'sourceLabel',
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
    $classes = [
        ...$translators, AuthorKey::class, LinkGuard::class, PhoneMasker::class, LegacyListingSource::class,
        LegacyContact::class, ContactService::class, ContactDisclosure::class, CallLinkService::class, CallLink::class,
        CallLinkClaims::class, CallPageController::class, TranslationService::class, TelegramClient::class,
        TelegramException::class, ShareService::class, PreparedShare::class, ListingTranslation::class,
        AuthorLabel::class, BlockedAuthorService::class,
    ];

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
            'LegacyListingSource::callUrl($answer)',
            'LegacyListingSource::callLink($display)',
            'LegacyContact::fromCard($card)',
            'LegacyContact::format($phone)',
            'CallLinkService::verify($token)',
            'CallLinkService::sign($secret)',
            'CallLink::__construct($url)',
            'CallPageController::__invoke($token)',
            'LegacyListingSource::translatedText($answer)',
            'TelegramClient::result($token)',
            'TelegramClient::call($params)',
            'TelegramClient::path($token)',
            'ShareService::message($telegramId)',
            'TelegramException::scrub($text)',
            'ListingTranslation::fromArray($data)',
            'ListingTranslation::__construct($text)',
            'AuthorLabel::ofPhone($phone)',
            'AuthorLabel::phone($sourceLabel)',
            'AuthorLabel::fromSourceLabel($sourceLabel)',
            'AuthorLabel::whole($text)',
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
