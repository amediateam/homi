<?php

namespace App\Services\Listings;

use App\Events\Listings\ContactDisclosed;
use App\Exceptions\Listings\ContactUnavailable;
use App\Models\User;
use App\Services\Sources\Data\ListingContact;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use InvalidArgumentException;

/**
 * The one disclosure of an author's number (WP-43, DEC-52, SEC-REQ-028): behind `POST /listings/{number}/contact`
 * (channel `app`) and the bot's «Показать номер» (`bot`, WP-53). Reading a card asks nothing here and discloses
 * nothing: the card only says whether a number exists (`contact.has_phone`). In this order:
 *
 * 1. whether the source has a contact (`ListingSource::hasContact()` of `source.listings.contact`: legacy reads its
 *    contact entry, else the card, never the call link): none is `404 contact_unavailable`, an unknown listing `404
 *    not_found`, a source that cannot answer `503`;
 * 2. `ContactDisclosure::decide()`: refused is `404 contact_unavailable`, and costs no call-link request;
 * 3. the source's contact (`ListingSource::contact()`; variant B asks legacy for its link now) and the answer —
 *    variant A (the source has the number): HOMI's call link (`CallLinkService`), valid `contacts.call_link_ttl` s,
 *    with the number in E.164 and its display; variant B (only a link): the source's link, `phone: null`. A listing
 *    whose link then fails (`404`, a host HOMI does not allow, `503`) has used its place of the day's quota and
 *    raises no event;
 * 4. `ContactDisclosure::record()`;
 * 5. `ContactDisclosed` (user id, listing number, channel).
 *
 * The quota and the event behave alike on every driver, the stub included. While `sources.native_stubs` is on, the
 * route's stub answers instead and nothing here runs (`NativeStubs`, WP-40).
 */
final readonly class ContactService
{
    public const string APP = 'app';

    public const string BOT = 'bot';

    public function __construct(
        private SourceManager $sources,
        private ContactDisclosure $disclosure,
        private CallLinkService $links,
    ) {}

    /**
     * The contact of the listing for the user, counted. Fails with `ContactUnavailable` (no contact, or refused by the
     * quota), `SourceNotFound` (an unknown listing) or `SourceUnavailable` (the source, or no signing key for HOMI's
     * link); these are not `@throws` tags, which the OpenAPI export would read as answers of the method.
     *
     * @param  string  $channel  `APP` or `BOT`
     */
    public function disclose(User $user, int $number, SourceContext $context, string $channel): ListingContact
    {
        if (! in_array($channel, [self::APP, self::BOT], true)) {
            throw new InvalidArgumentException("Unknown contact channel \"{$channel}\".");
        }

        $source = $this->sources->listings('source.listings.contact', $context)->source;

        if (! $source->hasContact($number, $context) || ! $this->disclosure->decide($user, $number)) {
            throw new ContactUnavailable;
        }

        $found = $source->contact($number, $context);

        if ($found->phone === null && trim($found->callUrl) === '') {
            throw new ContactUnavailable;
        }

        $contact = $found->phone === null ? $found : $this->homiLink($user, $number, $context, $found);
        $this->disclosure->record($user, $number);
        ContactDisclosed::dispatch($user->id, $number, $channel);

        return $contact;
    }

    /** Variant A: the source's number with HOMI's call link in place of whatever link the source gave. */
    private function homiLink(User $user, int $number, SourceContext $context, ListingContact $found): ListingContact
    {
        $link = $this->links->issue($user, $number, $context->locale);

        return new ListingContact($link->url, $link->expiresAt->toIso8601String(), $found->phone, $found->phoneDisplay);
    }
}
