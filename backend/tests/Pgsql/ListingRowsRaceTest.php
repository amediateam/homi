<?php

use App\Models\ListingRef;
use App\Models\ListingView;
use App\Models\User;
use App\Services\Listings\AuthorKey;
use App\Services\Listings\ListingRefs;
use App\Services\Listings\ViewRecorder;
use App\Services\Sources\Data\ListingDetails;
use Tests\Support\ListingArrays;

/*
 * WP-42: the rows of one listing are written by every request that reads it, so two requests race — the card of one
 * listing fetched from legacy by two users at once (each a cache miss), and two reads of one card by one user (two
 * tabs). Each child process writes in its own PostgreSQL connection after a shared start time, so their statements run
 * together: `listing_refs` must keep one row per number, and `listing_views` one row per user and number whose
 * `views` counts every read.
 */
it('keeps one listing_refs row when ten requests file the same card at once', function (): void {
    $startAt = microtime(true) + 2.0;

    $remember = static function () use ($startAt): int {
        $card = ListingDetails::fromArray(ListingArrays::details(['number' => 100012]));

        if ($startAt > microtime(true)) {
            time_sleep_until($startAt);
        }

        app(ListingRefs::class)->remember($card, new AuthorKey('phone:'.str_repeat('b', 32), 'phone'));

        return 1;
    };

    expect(concurrently(array_fill(0, 10, $remember)))->toBe(array_fill(0, 10, 1));

    $ref = ListingRef::query()->sole();
    expect($ref->listing_number)->toBe(100012)
        ->and($ref->author_key)->toBe('phone:'.str_repeat('b', 32))
        ->and($ref->source_channel)->toBe('stub_channel_a');
});

it('counts every one of ten reads of one card by one user at once in one listing_views row', function (): void {
    $id = User::factory()->create()->id;
    $startAt = microtime(true) + 2.0;

    $record = static function () use ($id, $startAt): bool {
        $card = ListingDetails::fromArray(ListingArrays::details(['number' => 100012]));
        $user = User::query()->findOrFail($id);

        if ($startAt > microtime(true)) {
            time_sleep_until($startAt);
        }

        return app(ViewRecorder::class)->record($user, $card)->preview->viewed;
    };

    expect(concurrently(array_fill(0, 10, $record)))->toBe(array_fill(0, 10, true));

    $view = ListingView::query()->sole();
    expect($view->user_id)->toBe($id)
        ->and($view->listing_number)->toBe(100012)
        ->and($view->views)->toBe(10);
});
