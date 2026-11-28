<?php

namespace App\Services\Personal;

use App\Exceptions\Sources\SourceNotFound;
use App\Models\BlockedAuthor as BlockedAuthorEntry;
use App\Models\User;
use App\Services\Listings\AuthorKey;
use App\Services\Listings\ListingPointer;
use App\Services\Listings\ListingRefs;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;

/**
 * The authors a user blocked (WP-44; task `KV-BE-041`, BR-API-097 … BR-API-099): every listing filed under the author's
 * key leaves this user's feed and map (the overlay of WP-42 reads `blocked_authors`). An entry per user and author key,
 * addressed by its ULID; a repeat answers the same entry.
 *
 * The author is the key `listing_refs` files for the listing (WP-42's `AuthorKey`: `phone:` + a keyed hash, `source:`
 * + the channel, the operator's `legacy:`), else the one a card read through the card source files — the legacy
 * driver files it on that read; the stub driver files none, so on the stub every block is `404 not_found` (brief
 * decision 14). A listing without an author is `404` too. No phone number is stored: the entry keeps the key, its kind
 * and a plain-text label (`AuthorLabel`), built once, when the entry is made.
 */
final readonly class BlockedAuthorService
{
    public function __construct(
        private ListingResolver $resolver,
        private ListingRefs $refs,
        private SourceManager $sources,
    ) {}

    /**
     * Blocks the author of the listing: `SourceNotFound` (`404`) for an unknown listing or one without an author,
     * `SourceUnavailable` (`503`) when the source must be asked and cannot answer — named here, not as `@throws`
     * tags, which the OpenAPI export would read as answers of the calling method.
     */
    public function block(User $user, int $number, SourceContext $context): BlockResult
    {
        $pointer = $this->resolver->resolve($number, $context);
        $card = null;
        $author = $this->refs->author($pointer->number);

        if ($author === null) {
            $card = $this->sources->listings('source.listings.card', $context)->source->details($pointer->number, $context);
            $author = $this->refs->author($card->preview->number);
        }

        if ($author === null) {
            throw new SourceNotFound('The listing has no author.');
        }

        $entry = $user->blockedAuthors()->where('author_key', $author->key)->first()
            ?? $this->create($user, $author, $pointer, $card, $context);

        return new BlockResult(
            id: $entry->id,
            kind: $entry->kind,
            label: $entry->label,
            count: $card->authorCount ?? $this->refs->liveCountsOfAuthors([$author->key])[$author->key],
            listingNumbers: $this->numbers($author->key, [$number, $pointer->number]),
        );
    }

    /**
     * The undo by listing: removes the caller's entry of the author `listing_refs` files for the number (or its
     * survivor), without asking the source; a listing whose author is not blocked changes nothing.
     */
    public function unblockByListing(User $user, int $number): void
    {
        $keys = [];

        foreach (array_unique([$number, $this->resolver->survivor($number)]) as $listing) {
            $author = $this->refs->author($listing);

            if ($author !== null) {
                $keys[] = $author->key;
            }
        }

        if ($keys !== []) {
            $user->blockedAuthors()->whereIn('author_key', $keys)->delete();
        }
    }

    /** Removes an entry the caller owns (looked up and authorised by the caller). */
    public function removeEntry(BlockedAuthorEntry $entry): void
    {
        $entry->delete();
    }

    /** A new entry, or the one a concurrent block of the same author made first (`createOrFirst`). */
    private function create(User $user, AuthorKey $author, ListingPointer $pointer, ?ListingDetails $card, SourceContext $context): BlockedAuthorEntry
    {
        $kind = self::kindOf($author);
        $entry = $user->blockedAuthors()->createOrFirst(['author_key' => $author->key], [
            'kind' => $kind,
            'label' => $this->label($author, $kind, $pointer, $card, $context),
            'listing_number' => $pointer->number,
            'source_channel' => $pointer->channel,
            'source_post_id' => $pointer->postId,
        ]);
        $this->resolver->backfill($pointer);

        return $entry;
    }

    /**
     * The plain-text label of the entry: a source author's `@channel`; a phone author's number as the source masks it
     * (`ListingSource::authorPhoneLabel()`, no disclosure), else the card's own label reduced (`AuthorLabel::phone()`).
     */
    private function label(AuthorKey $author, string $kind, ListingPointer $pointer, ?ListingDetails $card, SourceContext $context): string
    {
        if ($kind === 'source') {
            return AuthorLabel::source(self::channelOf($author, $pointer, $card));
        }

        $source = $this->sources->listings('source.listings.card', $context)->source;
        $masked = $source->authorPhoneLabel($pointer->number, $context);

        if ($masked === null) {
            $card ??= $source->details($pointer->number, $context);
        }

        return AuthorLabel::phone($masked, $card?->authorLabel);
    }

    /** `phone` for a phone key, or the operator's key of a phone author; `source` otherwise. */
    private static function kindOf(AuthorKey $author): string
    {
        return str_starts_with($author->key, AuthorKey::PHONE) || (str_starts_with($author->key, AuthorKey::LEGACY) && $author->kind === 'phone')
            ? 'phone'
            : 'source';
    }

    /** A source author's channel: the key's own, else (the operator's key) the listing's channel. */
    private static function channelOf(AuthorKey $author, ListingPointer $pointer, ?ListingDetails $card): string
    {
        if (str_starts_with($author->key, AuthorKey::SOURCE)) {
            return substr($author->key, strlen(AuthorKey::SOURCE));
        }

        return $card?->preview->sourceRef->channel ?? $pointer->channel ?? '';
    }

    /**
     * The newest `BlockResult::MAX_LISTINGS` live numbers `listing_refs` files under the key, with the ones asked (the
     * number and its survivor), ascending and once each.
     *
     * @param  list<int>  $asked
     * @return list<int>
     */
    private function numbers(string $key, array $asked): array
    {
        $numbers = array_values(array_unique([...$this->refs->liveNumbersOfAuthor($key, BlockResult::MAX_LISTINGS), ...$asked]));
        sort($numbers);

        return $numbers;
    }
}
