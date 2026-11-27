<?php

namespace App\Services\Listings;

use App\Models\ListingRef;
use App\Services\Sources\Data\ListingDetails;

/**
 * `listing_refs` (WP-42): where each listing number points. The legacy driver writes it — `remember()` for every full
 * card it fetches (a cache miss, so at most once a minute per listing), `markGone()` on a `404`, `markMerged()` when
 * legacy answers another number — and the overlay and the personal tables of WP-44 read it.
 *
 * Every write is one statement (an upsert or an update), so two requests for one listing never collide. A row is
 * created only for a number legacy answered for: `markGone()` updates a row HOMI has and never creates one, since a
 * card number is user input. No phone number is stored: the author is filed under `AuthorKey`.
 */
final class ListingRefs
{
    /** Numbers per `whereIn`, well below the bound parameters SQLite and PostgreSQL accept. */
    private const int CHUNK = 1000;

    /** The width of `source_channel` and `district_code`. */
    private const int MAX_TEXT = 64;

    /** Files a card legacy answered: its channel and post, its author and district; it is neither merged nor gone. */
    public function remember(ListingDetails $card, ?AuthorKey $author): void
    {
        $preview = $card->preview;
        $now = now();

        ListingRef::query()->upsert(
            [[
                'listing_number' => $preview->number,
                'source_channel' => self::fits($preview->sourceRef?->channel),
                'source_post_id' => $preview->sourceRef?->postId,
                'author_key' => $author?->key,
                'author_kind' => $author?->kind,
                'district_code' => self::fits($preview->districtCode),
                'merged_into' => null,
                'first_seen_at' => $now,
                'last_seen_at' => $now,
                'gone_at' => null,
            ]],
            ['listing_number'],
            ['source_channel', 'source_post_id', 'author_key', 'author_kind', 'district_code', 'merged_into', 'last_seen_at', 'gone_at'],
        );
    }

    /** The channel and post of a number, both `null` when HOMI has no row for it. */
    public function pointer(int $number): ListingPointer
    {
        $ref = ListingRef::query()->find($number);

        return new ListingPointer($number, $ref?->source_channel, $ref?->source_post_id);
    }

    /**
     * Every number filed under one of the author keys, ascending.
     *
     * @param  list<string>  $authorKeys
     * @return list<int>
     */
    public function numbersOfAuthors(array $authorKeys): array
    {
        $numbers = [];

        foreach (array_chunk(array_values(array_unique($authorKeys)), self::CHUNK) as $chunk) {
            foreach (ListingRef::query()->whereIn('author_key', $chunk)->pluck('listing_number') as $number) {
                $numbers[] = (int) $number;
            }
        }

        sort($numbers);

        return $numbers;
    }

    /**
     * The author key of each of the numbers that has one.
     *
     * @param  list<int>  $numbers
     * @return array<int, string> number => author key
     */
    public function authorKeysOf(array $numbers): array
    {
        $keys = [];

        foreach (array_chunk(array_values(array_unique($numbers)), self::CHUNK) as $chunk) {
            $rows = ListingRef::query()->whereIn('listing_number', $chunk)->whereNotNull('author_key')->pluck('author_key', 'listing_number');

            foreach ($rows as $number => $key) {
                if (is_string($key)) {
                    $keys[(int) $number] = $key;
                }
            }
        }

        return $keys;
    }

    /** Legacy no longer knows a number HOMI has a row for; a number without a row is not filed. */
    public function markGone(int $number): void
    {
        ListingRef::query()->whereKey($number)->whereNull('gone_at')->update(['gone_at' => now()]);
    }

    /** Legacy answered `$answered` for `$asked`: the asked number is a merged duplicate of the answered one. */
    public function markMerged(int $asked, int $answered): void
    {
        if ($asked === $answered) {
            return;
        }

        $now = now();

        ListingRef::query()->upsert(
            [['listing_number' => $asked, 'merged_into' => $answered, 'first_seen_at' => $now, 'last_seen_at' => $now, 'gone_at' => null]],
            ['listing_number'],
            ['merged_into', 'last_seen_at', 'gone_at'],
        );
    }

    /** A text that fits the 64-character columns, else `null`. */
    private static function fits(?string $text): ?string
    {
        return $text !== null && mb_strlen($text) <= self::MAX_TEXT ? $text : null;
    }
}
