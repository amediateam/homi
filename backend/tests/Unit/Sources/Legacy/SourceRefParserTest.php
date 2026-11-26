<?php

use App\Services\Sources\Legacy\Translators\SourceRefParser;

it('reads the channel and the post of a public post link', function (?string $url, ?array $ref): void {
    expect(SourceRefParser::parts($url))->toBe($ref);
})->with([
    'post link' => ['https://t.me/stub_channel_a/4001', ['channel' => 'stub_channel_a', 'post_id' => 4001]],
    'a channel in capitals, lower-cased' => ['https://t.me/Stub_Channel_A/4001', ['channel' => 'stub_channel_a', 'post_id' => 4001]],
    'preview link with s/' => ['https://t.me/s/stub_channel_b/4010', ['channel' => 'stub_channel_b', 'post_id' => 4010]],
    'with a query' => ['https://t.me/stub_channel_a/4001?single', ['channel' => 'stub_channel_a', 'post_id' => 4001]],
    'with a trailing slash' => ['https://t.me/stub_channel_a/4001/', ['channel' => 'stub_channel_a', 'post_id' => 4001]],
    'without a post id' => ['https://t.me/stub_channel_a', null],
    'a private channel' => ['https://t.me/c/1234567/89', null],
    'an invite' => ['https://t.me/+AbCdEf123', null],
    'another host' => ['https://example.invalid/stub_channel_a/4001', null],
    'plain http' => ['http://t.me/stub_channel_a/4001', null],
    'a non-numeric post' => ['https://t.me/stub_channel_a/latest', null],
    'null' => [null, null],
]);

it('takes the source of a card from original_url, else the first source link', function (array $card, ?array $ref): void {
    expect(SourceRefParser::fromCard($card))->toBe($ref);
})->with([
    'original_url' => [['original_url' => 'https://t.me/stub_channel_a/4001', 'sources' => [['url' => 'https://t.me/stub_channel_b/9']]], ['channel' => 'stub_channel_a', 'post_id' => 4001]],
    'first source' => [['original_url' => null, 'sources' => [['url' => 'https://t.me/stub_channel_b/9'], ['url' => 'https://t.me/stub_channel_c/10']]], ['channel' => 'stub_channel_b', 'post_id' => 9]],
    'original_url that is not a post' => [['original_url' => 'https://t.me/stub_channel_a', 'sources' => [['url' => 'https://t.me/stub_channel_b/9']]], ['channel' => 'stub_channel_b', 'post_id' => 9]],
    'a preview has neither' => [['id' => 100001], null],
    'original_url that could carry a phone number' => [['original_url' => 'https://t.me/a998007654321/12', 'sources' => [['url' => 'https://t.me/stub_channel_b/9']]], ['channel' => 'stub_channel_b', 'post_id' => 9]],
    'a first source that could carry a phone number' => [['sources' => [['url' => 'https://wa.me/998007654321'], ['url' => 'https://t.me/stub_channel_c/10']]], ['channel' => 'stub_channel_c', 'post_id' => 10]],
    'no sources' => [['sources' => []], null],
]);

it('builds the source object of the data layer', function (): void {
    expect(SourceRefParser::parse('https://t.me/s/stub_channel_c/5018')?->postId)->toBe(5018)
        ->and(SourceRefParser::parse('https://t.me/stub_channel_c'))->toBeNull();
});
