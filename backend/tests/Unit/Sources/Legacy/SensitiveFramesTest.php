<?php

use App\Services\Listings\AuthorKey;
use App\Services\Listings\LinkGuard;
use App\Services\Listings\PhoneMasker;
use App\Services\Sources\Legacy\Translators\LegacyValue;
use App\Services\Sources\Legacy\Translators\ListingDetailsTranslator;
use App\Services\Sources\Legacy\Translators\ListingSummaryTranslator;
use App\Services\Sources\Legacy\Translators\SourceRefParser;

/*
 * WP-42 (DEC-52, brief rule 6): every frame that takes a raw legacy card, item or answer, a part of one, or an
 * author-written text or link before it is masked marks that parameter `#[\SensitiveParameter]`, so a stack trace of an
 * exception thrown inside it never shows the author's number. The data objects' `fromArray()` take the translated,
 * number-free arrays and are not listed; nor are the map, flow, new-since and city translators, whose answers carry no
 * author data.
 */

/**
 * @return array<string, array{class-string, string, string}>
 */
function sensitiveFrames(): array
{
    $frames = [
        AuthorKey::class => [
            'fromCard' => ['legacyCard'], 'derive' => ['card', 'secret'], 'e164' => ['phone'], 'phoneHash' => ['phone', 'secret'],
            'operatorValue' => ['value'], 'kindOf' => ['card'],
        ],
        SourceRefParser::class => ['parse' => ['url'], 'parts' => ['url'], 'fromCard' => ['item']],
        ListingSummaryTranslator::class => [
            'page' => ['answer'], 'toData' => ['item'], 'translate' => ['item'], 'number' => ['item'], 'fields' => ['item'],
            'photoCount' => ['item'], 'deal' => ['item'], 'masked' => ['text'], 'title' => ['item'], 'posted' => ['item'],
        ],
        ListingDetailsTranslator::class => [
            'toData' => ['card'], 'translate' => ['card'], 'mode' => ['card'], 'tier' => ['card'], 'ownerLabel' => ['card'],
            'facts' => ['facts'], 'nearby' => ['card'], 'stats' => ['card'], 'history' => ['card'], 'author' => ['card'],
            'offers' => ['card'], 'sources' => ['sources'], 'comparison' => ['card'], 'name' => ['name'], 'masked' => ['text'],
        ],
        LegacyValue::class => [
            'string' => ['data'], 'number' => ['data'], 'int' => ['data'], 'count' => ['data'], 'bool' => ['data'],
            'flag' => ['data'], 'truthy' => ['data'], 'objects' => ['data'], 'requiredList' => ['data'], 'fits' => ['part'],
            'odd' => ['value'],
        ],
        LinkGuard::class => ['safeName' => ['name'], 'safe' => ['url'], 'channelOf' => ['path'], 'decoded' => ['url']],
        PhoneMasker::class => ['mask' => ['text'], 'maskText' => ['text'], 'maskLink' => ['link'], 'lastTwo' => ['number'], 'digits' => ['number']],
    ];
    $cases = [];

    foreach ($frames as $class => $methods) {
        foreach ($methods as $method => $parameters) {
            foreach ($parameters as $parameter) {
                $cases[class_basename($class)."::{$method}(\${$parameter})"] = [$class, $method, $parameter];
            }
        }
    }

    return $cases;
}

it('marks every parameter that holds raw legacy data or an unmasked text as sensitive', function (string $class, string $method, string $name): void {
    $parameters = array_values(array_filter(
        (new ReflectionMethod($class, $method))->getParameters(),
        fn (ReflectionParameter $parameter): bool => $parameter->getName() === $name,
    ));

    expect($parameters)->toHaveCount(1)
        ->and($parameters[0]->getAttributes(SensitiveParameter::class))->toHaveCount(1);
})->with(sensitiveFrames());
