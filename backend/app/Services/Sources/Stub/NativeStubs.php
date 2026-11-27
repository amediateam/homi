<?php

namespace App\Services\Sources\Stub;

use App\Enums\SourceDriver;
use App\Exceptions\Identity\InitDataExpired;
use App\Exceptions\Identity\InvalidInitData;
use App\Exceptions\Identity\InvalidInitDataReason;
use App\Exceptions\Listings\ShareFailed;
use App\Exceptions\Listings\TranslationNotNeeded;
use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use App\Http\Requests\Api\V1\Auth\TelegramSignInRequest;
use App\Http\Requests\Api\V1\Personal\ListPersonalRequest;
use App\Http\Requests\Api\V1\UpdateSettingsRequest;
use App\Http\Resources\Api\V1\BlockedAuthorResultResource;
use App\Http\Resources\Api\V1\ContactResource;
use App\Http\Resources\Api\V1\FavoriteStateResource;
use App\Http\Resources\Api\V1\HiddenOverviewResource;
use App\Http\Resources\Api\V1\ListingPreviewResource;
use App\Http\Resources\Api\V1\MeResource;
use App\Http\Resources\Api\V1\PreparedShareResource;
use App\Http\Resources\Api\V1\SessionResource;
use App\Http\Resources\Api\V1\SettingsResource;
use App\Http\Resources\Api\V1\TranslationResource;
use App\Services\Identity\TokenIssuer;
use App\Services\Personal\BlockedAuthor;
use App\Services\Personal\HiddenOverview;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use App\Services\Telegram\PreparedShare;
use Illuminate\Contracts\Container\Container;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Resources\Json\ResourceCollection;
use LogicException;
use Symfony\Component\HttpFoundation\Response;

/**
 * The stub answers of the native methods whose controllers stage C has replaced (WP-40, `25` §9): while
 * `config('sources.native_stubs')` is on, `AnswerNativeStubs` answers a route named here with its stub body instead of
 * the controller, so the end-to-end suite keeps running on stubs. The switch exists only in `local` and `testing`
 * (`SourceServiceProvider` refuses it elsewhere).
 *
 * Rule for every package of stage C: when a stub controller body is replaced, the old body moves here, unchanged; it
 * is not deleted. Each body is called through the container, so its form request validates as it did in the
 * controller, and it answers the envelope of `ApiController::sourced()` with `meta.source = stub`.
 *
 * WP-40 moved here: sign-in (every value signs in the one stub user, nothing is verified, the token is not capped),
 * `GET /me`, `GET /settings` and `PATCH /settings`. WP-43 moved here `POST /listings/{number}/contact`: on the stub
 * driver the stub's number and its link `{APP_URL}/call/stub-token-<number>` as it answered before, `meta.source =
 * stub` — no disclosure quota, no HOMI call link, no `ContactDisclosed` — and `503` on any other driver; `POST /listings/{number}/translation`: the translation of the method's driver, uncached and
 * without the limit of misses, `ru` answering `422`; and `POST /listings/{number}/share`: `stub-prepared-<number>`,
 * valid an hour, for a listing the card source knows, the scenario `share_failed` answering `502` — no Bot API call.
 *
 * WP-44 moved here the personal lists of WP-13 (brief decision 10): favourites, history, hidden listings, blocked
 * authors and the hidden overview answer the fixtures of `favorites/`, `history/` and `hidden/` and store nothing, so
 * the end-to-end suite stays stateless (a write never changes a list, a clear never empties one) — and no query
 * touches HOMI's personal tables while the switch is on.
 */
final readonly class NativeStubs
{
    /**
     * The stub scenarios of the user object; sign-in answers the same user. `replay` is a profile sampled for replay
     * (`analytics.replay: true`, `replay_rate: 1`) for WP-32's analytics specs. Every profile has requests waiting for
     * none (`owner.pending: 0`), so the owner signals of WP-82 stay quiet; `owner_pending` has two, as the stub list's
     * listing `01JF…03`.
     *
     * @var array<string, string>
     */
    public const array ME_SCENARIOS = [
        'first_launch' => 'me/first_launch',
        'no_city' => 'me/no_city',
        'uz' => 'me/uz',
        'en' => 'me/en',
        'owner_empty' => 'me/owner_empty',
        'owner_waitlisted' => 'me/owner_waitlisted',
        'replay' => 'me/replay',
        'owner_pending' => 'me/owner_pending',
    ];

    /**
     * The scenario `card_rich` answers the settings of a user who chose the `rich` card style.
     *
     * @var array<string, string>
     */
    public const array SETTINGS_SCENARIOS = ['card_rich' => 'settings/card_rich'];

    /** @var array<string, string> route name => the method of this class that answers it */
    private const array ROUTES = [
        'api.v1.auth.telegram' => 'signIn',
        'api.v1.me.show' => 'me',
        'api.v1.settings.show' => 'settings',
        'api.v1.settings.update' => 'updateSettings',
        'api.v1.listings.contact' => 'contact',
        'api.v1.listings.translation' => 'translation',
        'api.v1.listings.share' => 'share',
        'api.v1.favorites.index' => 'favorites',
        'api.v1.favorites.update' => 'setFavorite',
        'api.v1.favorites.destroy' => 'unsetFavorite',
        'api.v1.history.index' => 'history',
        'api.v1.history.destroy' => 'clearHistory',
        'api.v1.hidden.listings.update' => 'hideListing',
        'api.v1.hidden.listings.destroy' => 'unhideListing',
        'api.v1.listings.blocked-author.update' => 'blockAuthor',
        'api.v1.listings.blocked-author.destroy' => 'unblockAuthor',
        'api.v1.hidden.index' => 'hidden',
        'api.v1.hidden.authors.destroy' => 'removeBlockedAuthor',
        'api.v1.hidden.destroy' => 'clearHidden',
    ];

    public function __construct(private Container $container) {}

    /** @return list<string> the route names that have a stub answer */
    public function routes(): array
    {
        return array_keys(self::ROUTES);
    }

    public function answers(string $route): bool
    {
        return isset(self::ROUTES[$route]);
    }

    /**
     * The stub answer of the route: JSON, or an empty `204` where the method answers one; its dependencies (the form
     * request among them) are resolved by the container.
     */
    public function answer(string $route): Response
    {
        $answer = $this->container->call([$this, self::ROUTES[$route]]);

        return $answer instanceof Response ? $answer : throw new LogicException("The stub of {$route} gave no answer.");
    }

    /** `POST /auth/telegram` on stubs (WP-11): any valid body signs in the stub user; a real token of 24 hours. */
    public function signIn(TelegramSignInRequest $request, StubResponder $stubs): JsonResponse
    {
        $me = $stubs->fixture('me/default', $request, self::ME_SCENARIOS, [
            'auth_expired' => fn (): InitDataExpired => new InitDataExpired,
            'invalid_init_data' => fn (): InvalidInitData => new InvalidInitData(InvalidInitDataReason::BadSignature),
        ]);
        $expiresAt = now()->addDay();
        $token = StubUser::get()->createToken(TokenIssuer::NAME, TokenIssuer::ABILITIES, $expiresAt);

        return $this->sourced(new SessionResource($token, $expiresAt, $me));
    }

    /** `GET /me` on stubs (WP-11). */
    public function me(Request $request, StubResponder $stubs): JsonResponse
    {
        return $this->sourced(new MeResource($stubs->fixture('me/default', $request, self::ME_SCENARIOS)));
    }

    /** `GET /settings` on stubs (WP-11). */
    public function settings(Request $request, StubResponder $stubs): JsonResponse
    {
        return $this->sourced(new SettingsResource($stubs->fixture('settings/default', $request, self::SETTINGS_SCENARIOS)));
    }

    /** `PATCH /settings` on stubs (WP-11): validates and answers the fixture with the sent keys overlaid; nothing is stored. */
    public function updateSettings(UpdateSettingsRequest $request, StubResponder $stubs): JsonResponse
    {
        $settings = array_replace($stubs->fixture('settings/default', $request, self::SETTINGS_SCENARIOS), $request->validated());

        return $this->sourced(new SettingsResource($settings));
    }

    /**
     * `POST /listings/{number}/contact` as WP-12 answered it (the controller body before WP-43): the contact of the stub
     * driver of `source.listings.contact`, nothing counted. On any other driver it is `503 source_unavailable`, as
     * every other driver answered before WP-43: an uncounted answer from a real source would hand out a raw number with
     * no quota and blank link fields.
     */
    public function contact(Request $request, SourceManager $sources): JsonResponse
    {
        $number = $request->route('number');
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->listings('source.listings.contact', $context);

        if ($resolved->driver !== SourceDriver::Stub) {
            throw new SourceUnavailable;
        }

        return $this->sourced(new ContactResource($resolved->source->contact(is_numeric($number) ? (int) $number : 0, $context)), $resolved->driver);
    }

    /**
     * `POST /listings/{number}/translation` as WP-12 answered it (the controller body before WP-43): the translation of
     * the driver of `source.listings.translation`, neither cached nor limited per miss.
     */
    public function translation(Request $request, SourceManager $sources): JsonResponse
    {
        $number = $request->route('number');
        $context = SourceContext::fromRequest($request);

        if ($context->locale === 'ru') {
            throw new TranslationNotNeeded;
        }

        $resolved = $sources->listings('source.listings.translation', $context);

        return $this->sourced(new TranslationResource($resolved->source->translation(is_numeric($number) ? (int) $number : 0, $context)), $resolved->driver);
    }

    /**
     * `POST /listings/{number}/share` as WP-12 answered it (the controller body before WP-43): a stub id for a listing
     * the card source knows, `meta.source = stub`; the scenario `share_failed` answers `502`.
     */
    public function share(Request $request, StubResponder $stub, SourceManager $sources): JsonResponse
    {
        $number = $request->route('number');
        $context = $stub->check($request, ['share_failed' => fn (): ShareFailed => new ShareFailed]);
        $listing = $sources->listings('source.listings.card', $context)->source->preview(is_numeric($number) ? (int) $number : 0, $context);
        $share = new PreparedShare("stub-prepared-{$listing->number}", now()->addHour()->toIso8601String());

        return $this->sourced(new PreparedShareResource($share));
    }

    /**
     * `GET /favorites` on stubs (WP-13): previews of `favorites/default.json`, newest first, each with `favorite: true`,
     * paged like the feed (DEC-53); scenario `empty`. Stateless: a write never changes the list.
     */
    public function favorites(ListPersonalRequest $request, StubResponder $stubs, StubListingRefs $refs): JsonResponse
    {
        $context = $stubs->check($request);
        $numbers = $refs->numbers($context->scenario === 'empty' ? 'favorites/empty' : 'favorites/default');
        [$items, $next] = $refs->page($numbers, $request->cursor(), $request->limit(), $context);
        $items = array_map(fn (ListingSummary $item): ListingSummary => $item->withFlags(favorite: true), $items);

        return $this->cursorPage(ListingPreviewResource::collection($items), $next);
    }

    /** `PUT /favorites/{number}` on stubs (WP-13): idempotent; the listing must exist (`404`), or be checkable (`503`). */
    public function setFavorite(Request $request, StubResponder $stubs, StubListingRefs $refs): JsonResponse
    {
        $context = $stubs->check($request);
        $refs->preview(self::positive($request), $context);

        return $this->sourced(new FavoriteStateResource(true));
    }

    /** `DELETE /favorites/{number}` on stubs (WP-13): idempotent, never `404` for a listing that was not a favourite. */
    public function unsetFavorite(Request $request, StubResponder $stubs): JsonResponse
    {
        $stubs->check($request);
        self::positive($request);

        return $this->sourced(new FavoriteStateResource(false));
    }

    /** `GET /history` on stubs (WP-13): previews by last view, newest first, each with `viewed: true`; scenario `empty`. */
    public function history(ListPersonalRequest $request, StubResponder $stubs, StubListingRefs $refs): JsonResponse
    {
        $context = $stubs->check($request);
        $numbers = $refs->numbers($context->scenario === 'empty' ? 'history/empty' : 'history/default');
        [$items, $next] = $refs->page($numbers, $request->cursor(), $request->limit(), $context);
        $items = array_map(fn (ListingSummary $item): ListingSummary => $item->withFlags(viewed: true), $items);

        return $this->cursorPage(ListingPreviewResource::collection($items), $next);
    }

    /** `DELETE /history` on stubs (WP-13): `204`, idempotent; nothing is cleared. */
    public function clearHistory(Request $request, StubResponder $stubs): Response
    {
        $stubs->check($request);

        return response()->noContent();
    }

    /** `PUT /hidden/listings/{number}` on stubs (WP-13): the listing must exist; `204`. */
    public function hideListing(Request $request, StubResponder $stubs, StubListingRefs $refs): Response
    {
        $context = $stubs->check($request);
        $refs->preview(self::positive($request), $context);

        return response()->noContent();
    }

    /** `DELETE /hidden/listings/{number}` on stubs (WP-13): `204` without looking the listing up. */
    public function unhideListing(Request $request, StubResponder $stubs): Response
    {
        $stubs->check($request);
        self::positive($request);

        return response()->noContent();
    }

    /**
     * `PUT /listings/{number}/blocked-author` on stubs (WP-13): the author is the card's `author` (`404 not_found` when
     * the listing has none); the entry id and the author's other listings come from `hidden/blocked_author.json`.
     */
    public function blockAuthor(Request $request, StubResponder $stubs, SourceManager $sources, StubListingRefs $refs): JsonResponse
    {
        $context = $stubs->check($request);
        $card = $sources->listings('source.listings.card', $context)->source->details(self::positive($request), $context);

        if ($card->authorKind === null || $card->authorLabel === null) {
            throw new SourceNotFound('The listing has no author.');
        }

        $entry = new BlockedAuthor(
            id: $refs->entryId('hidden/blocked_author'),
            kind: $card->authorKind,
            label: $card->authorLabel,
            count: (int) $card->authorCount,
            listingNumbers: $refs->numbers('hidden/blocked_author', 'listing_numbers'),
        );

        return $this->sourced(new BlockedAuthorResultResource($entry));
    }

    /** `DELETE /listings/{number}/blocked-author` on stubs (WP-13): the undo by listing, `204`. */
    public function unblockAuthor(Request $request, StubResponder $stubs): Response
    {
        $stubs->check($request);
        self::positive($request);

        return response()->noContent();
    }

    /** `GET /hidden` on stubs (WP-13): `hidden/default.json`, scenario `empty`. */
    public function hidden(Request $request, StubResponder $stubs, StubListingRefs $refs): JsonResponse
    {
        $context = $stubs->check($request);
        $fixture = $context->scenario === 'empty' ? 'hidden/empty' : 'hidden/default';
        $overview = new HiddenOverview(
            $refs->previews($refs->numbers($fixture, 'listings'), $context),
            $refs->blockedAuthors($fixture),
        );

        return $this->sourced(new HiddenOverviewResource($overview));
    }

    /**
     * `DELETE /hidden/authors/{id}` on stubs (WP-13): `204` for an entry id of `hidden/default.json`; any other id
     * answers like a missing one, `404 not_found` (SEC-REQ-014).
     */
    public function removeBlockedAuthor(Request $request, StubResponder $stubs, StubListingRefs $refs): Response
    {
        $stubs->check($request);
        $id = $request->route('id');

        foreach ($refs->blockedAuthors('hidden/default') as $author) {
            if (is_string($id) && $author->id === strtoupper($id)) {
                return response()->noContent();
            }
        }

        throw new SourceNotFound('Blocked author not found.');
    }

    /** `DELETE /hidden` on stubs (WP-13): `204`; nothing is cleared. */
    public function clearHidden(Request $request, StubResponder $stubs): Response
    {
        $stubs->check($request);

        return response()->noContent();
    }

    /** The positive listing number of the route, else `404 not_found`. */
    private static function positive(Request $request): int
    {
        $number = $request->route('number');
        $number = is_numeric($number) ? (int) $number : 0;

        return $number > 0 ? $number : throw new SourceNotFound('Listing not found.');
    }

    /** The envelope of `ApiController::cursorPage()` for a stub list. */
    private function cursorPage(ResourceCollection $items, ?string $nextCursor): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $items,
            'meta' => ['next_cursor' => $nextCursor, 'source' => SourceDriver::Stub],
        ]);
    }

    /** The envelope of `ApiController::sourced()` for a stub answer without extra meta. */
    private function sourced(JsonResource $data, SourceDriver $driver = SourceDriver::Stub): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'meta' => ['source' => $driver],
        ]);
    }
}
