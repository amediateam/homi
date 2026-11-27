<?php

use App\Services\Listings\PhotoUrlRewriter;

const PHOTO_BASE = 'https://media.homi.test/lm';

function photoRewriter(string $base = PHOTO_BASE): PhotoUrlRewriter
{
    return new PhotoUrlRewriter($base, ['legacy.invalid', 'App.Legacy.Invalid']);
}

it('rewrites a legacy photo address to HOMI\'s media host with the query intact (RES-001)', function (string $address, string $rewritten): void {
    expect(photoRewriter()->rewrite($address))->toBe($rewritten);
})->with([
    'relative' => ['/media/100001/1.jpg?e=1795132800&s=730b7358ab65adf549200082d99c5e9d', PHOTO_BASE.'/100001/1.jpg?e=1795132800&s=730b7358ab65adf549200082d99c5e9d'],
    'absolute on the legacy host' => ['https://legacy.invalid/media/100005/4.jpg?e=1&s=abc', PHOTO_BASE.'/100005/4.jpg?e=1&s=abc'],
    'a host in another case' => ['https://app.legacy.invalid/media/100005/4.jpg?e=1&s=abc', PHOTO_BASE.'/100005/4.jpg?e=1&s=abc'],
    'a base with a trailing slash' => ['/media/1/2.jpg?e=1&s=a', PHOTO_BASE.'/1/2.jpg?e=1&s=a'],
]);

it('keeps the …/<digits>/<digits>.jpg?… form the client derives the small variant from (RES-002)', function (): void {
    $rewritten = (string) photoRewriter(PHOTO_BASE.'/')->rewrite('/media/100001/3.jpg?e=1&s=abc');

    expect($rewritten)->toMatch('~/\d+/\d+\.jpg\?~')
        ->and(str_replace('.jpg?', '.s.jpg?', $rewritten))->toBe(PHOTO_BASE.'/100001/3.s.jpg?e=1&s=abc');
});

it('drops and counts any other address', function (mixed $address): void {
    $rewriter = photoRewriter();

    expect($rewriter->rewrite($address))->toBeNull()
        ->and($rewriter->dropped())->toBe(1);
})->with([
    'another host' => ['https://elsewhere.invalid/media/1/2.jpg?e=1&s=a'],
    'plain http' => ['http://legacy.invalid/media/1/2.jpg?e=1&s=a'],
    'protocol-relative' => ['//legacy.invalid/media/1/2.jpg?e=1&s=a'],
    'a user in it' => ['https://x@legacy.invalid/media/1/2.jpg?e=1&s=a'],
    'a port' => ['https://legacy.invalid:8443/media/1/2.jpg?e=1&s=a'],
    'another path' => ['/uploads/1/2.jpg?e=1&s=a'],
    'the small variant' => ['/media/1/2.s.jpg?e=1&s=a'],
    'no query' => ['/media/1/2.jpg'],
    'a query with markup' => ['/media/1/2.jpg?e=1&s="><script>'],
    'a fragment' => ['/media/1/2.jpg?e=1&s=a#x'],
    'not a string' => [42],
    'null' => [null],
]);

it('keeps the order of a list and leaves out what it drops', function (): void {
    $rewriter = photoRewriter();

    expect($rewriter->rewriteAll(['/media/1/1.jpg?e=1&s=a', 'https://elsewhere.invalid/x.jpg', '/media/1/2.jpg?e=1&s=a']))
        ->toBe([PHOTO_BASE.'/1/1.jpg?e=1&s=a', PHOTO_BASE.'/1/2.jpg?e=1&s=a'])
        ->and($rewriter->dropped())->toBe(1)
        ->and($rewriter->rewriteAll('not a list'))->toBe([]);
});

it('gives empty lists without a configured base, and counts nothing as foreign', function (): void {
    $rewriter = photoRewriter('');

    expect($rewriter->isConfigured())->toBeFalse()
        ->and($rewriter->rewriteAll(['/media/1/1.jpg?e=1&s=a']))->toBe([])
        ->and($rewriter->rewrite('/media/1/1.jpg?e=1&s=a'))->toBeNull()
        ->and($rewriter->dropped())->toBe(0)
        ->and(photoRewriter()->isConfigured())->toBeTrue();
});
