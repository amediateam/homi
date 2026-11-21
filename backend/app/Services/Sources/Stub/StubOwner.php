<?php

namespace App\Services\Sources\Stub;

use App\Enums\ContactRequestStatus;
use App\Enums\OwnerListingStatus;
use App\Enums\OwnerRejectReason;
use App\Enums\OwnerRequestAction;
use App\Exceptions\Owner\OwnerListingLocked;
use App\Exceptions\Owner\OwnerPhoneRequired;
use App\Exceptions\Owner\OwnerPhotoLimit;
use App\Exceptions\Owner\OwnerRejected;
use App\Exceptions\Requests\RequestAnswerClosed;
use App\Exceptions\Sources\SourceNotFound;
use App\Services\Owner\Data\OwnerDemand;
use App\Services\Owner\Data\OwnerListing;
use App\Services\Owner\Data\OwnerListingForm;
use App\Services\Owner\Data\OwnerListings;
use App\Services\Owner\Data\OwnerPlace;
use App\Services\Owner\Data\OwnerRequest;
use App\Services\Sources\Data\Fields;
use App\Services\Sources\SourceContext;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The owner cabinet on stubs (WP-80, "Owner fixtures"; real from WP-84 and WP-85). It reads `owner/*.json` and stores
 * nothing: the show answers the entry of `owner/list.json` with that id (`404` for any other), writes answer that entry
 * with the change applied. The complete draft without a phone (`…04`) stands in for the scenarios of the phone and of
 * publish (`phone_set`, `phone_not_uz`, `phone_not_own`, `rejected_*`, `held_check`).
 */
final class StubOwner
{
    /** The complete draft without a phone of `owner/list.json`. */
    public const string COMPLETE_DRAFT = '01JF0000000000000000000004';

    /** The untouched draft of `owner/list.json` (DEV-054). */
    public const string UNTOUCHED_DRAFT = '01JF0000000000000000000001';

    /** The number a first publish gives on stubs. */
    public const int NEXT_NUMBER = 10000013;

    public function __construct(private readonly FixtureStore $fixtures) {}

    public function listings(SourceContext $context): OwnerListings
    {
        $data = $this->fixtures->pick($context, 'owner/list', ['owner_empty' => 'owner/list.empty', 'owner_returning' => 'owner/list.returning']);

        return new OwnerListings(
            items: array_map(fn (array $item): OwnerListing => OwnerListing::fromArray($this->tokens($item)), Fields::objects($data, 'items')),
            max: Fields::int($data, 'max'),
            canAdd: Fields::bool($data, 'can_add'),
            past: Fields::count($data, 'past'),
        );
    }

    /**
     * The raw entry of `id`, with the show scenarios applied to the complete draft.
     *
     * @return array<array-key, mixed>
     *
     * @throws SourceNotFound
     */
    public function entry(string $id, ?SourceContext $context = null): array
    {
        foreach (Fields::objects($this->fixtures->get('owner/list'), 'items') as $item) {
            if (($item['id'] ?? null) === $id) {
                return $this->scenario($this->tokens($item), $context);
            }
        }

        throw new SourceNotFound('Owner listing not found.');
    }

    public function find(string $id, ?SourceContext $context = null): OwnerListing
    {
        return OwnerListing::fromArray($this->entry($id, $context));
    }

    /** A new draft (`201`): request mode, USD, the caller's city or none, every other key empty. */
    public function newDraft(?string $city): OwnerListing
    {
        $draft = $this->entry(self::UNTOUCHED_DRAFT);
        $draft['id'] = strtoupper((string) Str::ulid());
        $draft['form']['city'] = $city;

        return OwnerListing::fromArray($draft);
    }

    /**
     * `PATCH`: the sent form keys applied — `null` clears, an absent key stays — and a shown point beside a new one.
     *
     * @param  array<string, mixed>  $changes
     */
    public function update(string $id, array $changes, SourceContext $context): OwnerListing
    {
        $entry = $this->unlocked($id, $context);

        foreach (OwnerListingForm::KEYS as $key) {
            if (array_key_exists($key, $changes)) {
                $entry['form'][$key] = $key === 'tenants' ? ($changes[$key] ?? []) : $changes[$key];
            }
        }

        if (array_key_exists('lat', $changes)) {
            $lat = $entry['form']['lat'];
            $lon = $entry['form']['lon'];
            $entry['shown_point'] = is_numeric($lat) && is_numeric($lon)
                ? ['lat' => round((float) $lat + 0.0016, 5), 'lon' => round((float) $lon + 0.0017, 5), 'radius_m' => 500]
                : null;
        }

        return OwnerListing::fromArray($entry);
    }

    /** The draft or the rejected listing is deleted; any other state is locked. */
    public function destroy(string $id, SourceContext $context): void
    {
        $listing = OwnerListing::fromArray($this->notLockedByScenario($id, $context));

        if (! in_array($listing->status, [OwnerListingStatus::Draft, OwnerListingStatus::Rejected], true)) {
            throw new OwnerListingLocked;
        }
    }

    public function addPhoto(string $id, SourceContext $context): OwnerListing
    {
        $entry = $this->unlocked($id, $context);

        if (count(Fields::objects($entry, 'photos')) >= Config::integer('owner.limits.photos')) {
            throw new OwnerPhotoLimit;
        }

        $number = count(Fields::objects($entry, 'photos')) + 1;
        $entry['photos'][] = ['id' => strtoupper((string) Str::ulid()), 'url' => rtrim(Config::string('media.public_url'), '/')."/stub/10000008/{$number}.jpg?e=0&s=stub"];

        return OwnerListing::fromArray($entry);
    }

    public function removePhoto(string $id, string $photo, SourceContext $context): OwnerListing
    {
        $entry = $this->unlocked($id, $context);
        $photos = array_values(array_filter(Fields::objects($entry, 'photos'), fn (array $item): bool => ($item['id'] ?? null) !== $photo));

        if (count($photos) === count(Fields::objects($entry, 'photos'))) {
            throw new SourceNotFound('Photo not found.');
        }

        $entry['photos'] = $photos;

        return OwnerListing::fromArray($entry);
    }

    /** @param  list<string>  $ids */
    public function orderPhotos(string $id, array $ids, SourceContext $context): OwnerListing
    {
        $entry = $this->unlocked($id, $context);
        $byId = [];

        foreach (Fields::objects($entry, 'photos') as $photo) {
            $byId[(string) $photo['id']] = $photo;
        }

        $sorted = $ids;
        $current = array_keys($byId);
        sort($sorted);
        sort($current);

        if ($sorted !== $current || count(array_unique($ids)) !== count($ids)) {
            throw ValidationException::withMessages(['ids' => 'The ids must be exactly the listing\'s photos, each once.']);
        }

        $entry['photos'] = array_map(fn (string $photo): array => $byId[$photo], $ids);

        return OwnerListing::fromArray($entry);
    }

    public function contactMode(string $id, string $mode, SourceContext $context): OwnerListing
    {
        $entry = $this->unlocked($id, $context);
        $entry['contact_mode'] = $mode;

        return OwnerListing::fromArray($entry);
    }

    /** `POST …/publish`: refusals in the order of WP-84, else the listing active with its number. */
    public function publish(string $id, SourceContext $context): OwnerListing
    {
        // The listing as it is before publish: the phone scenarios apply, while a hold or a refusal is what publish
        // answers, not the state it starts from.
        $outcome = in_array($context->scenario, ['held_check', 'rejected_denied', 'rejected_limit'], true);
        $entry = $outcome ? $this->entry($id) : $this->entry($id, $context);

        if ($context->scenario === 'listing_locked' || OwnerListing::fromArray($entry)->locked()) {
            throw new OwnerListingLocked;
        }

        $rejected = OwnerListing::fromArray($entry);

        if ($rejected->status === OwnerListingStatus::Rejected) {
            throw new OwnerRejected(($rejected->rejectReason ?? OwnerRejectReason::Denied)->value);
        }
        $listing = OwnerListing::fromArray($entry);

        if ($listing->status === OwnerListingStatus::Active) {
            return $listing;
        }

        $missing = [];
        $form = $listing->form;
        $form->city === null && $missing['city'] = 'The city is required.';
        $form->lat === null && $missing['place'] = 'The point is required.';
        $form->rooms === null && ! $form->room && $missing['rooms'] = 'The rooms are required.';
        $form->price === null && $missing['price'] = 'The price is required.';
        $listing->photos === [] && $missing['photos'] = 'A photo is required.';

        if ($context->scenario === 'publish_missing') {
            $missing = ['place' => 'The point is required.', 'photos' => 'A photo is required.'];
        }

        if ($missing !== []) {
            throw ValidationException::withMessages($missing);
        }

        if (! $listing->phoneSet && $context->scenario !== 'held_check') {
            throw new OwnerPhoneRequired;
        }

        if ($listing->status === OwnerListingStatus::Paused) {
            return $listing;
        }

        $entry['number'] ??= self::NEXT_NUMBER;

        if ($context->scenario === 'held_check') {
            return OwnerListing::fromArray(array_merge($entry, ['status' => 'paused', 'held' => true, 'hold_reason' => 'check_agent', 'published_at' => null]));
        }

        $entry['status'] = 'active';
        $entry['published_at'] ??= now()->toIso8601String();

        return OwnerListing::fromArray($entry);
    }

    /** `PUT …/status`: `active` ↔ `paused`; `active` or `paused` → `rented` or `removed`. */
    public function status(string $id, OwnerListingStatus $next, SourceContext $context): OwnerListing
    {
        $entry = $this->notLockedByScenario($id, $context);
        $listing = OwnerListing::fromArray($entry);

        if ($listing->withdrawn || in_array($listing->status, [OwnerListingStatus::Rented, OwnerListingStatus::Removed], true) || ($listing->held && $next === OwnerListingStatus::Active)) {
            throw new OwnerListingLocked;
        }

        $allowed = match ($listing->status) {
            OwnerListingStatus::Active => [OwnerListingStatus::Paused, OwnerListingStatus::Rented, OwnerListingStatus::Removed],
            OwnerListingStatus::Paused => [OwnerListingStatus::Active, OwnerListingStatus::Rented, OwnerListingStatus::Removed],
            default => [],
        };

        if (! in_array($next, $allowed, true)) {
            throw ValidationException::withMessages(['status' => 'The listing cannot take this status now.']);
        }

        $entry['status'] = $next->value;

        return OwnerListing::fromArray($entry);
    }

    /**
     * The requests of a listing, newest first.
     *
     * @return list<OwnerRequest>
     */
    public function requests(string $id): array
    {
        $this->entry($id);

        return array_map(OwnerRequest::fromArray(...), Fields::objects($this->fixtures->get('owner/requests'), 'items'));
    }

    /** The request `id` of `owner/requests.json`, else `404`. */
    public function request(string $id): OwnerRequest
    {
        foreach (Fields::objects($this->fixtures->get('owner/requests'), 'items') as $item) {
            if (($item['id'] ?? null) === $id) {
                return OwnerRequest::fromArray($item);
            }
        }

        throw new SourceNotFound('Request not found.');
    }

    /** `POST /owner/requests/{id}/answer`: the request with the action applied, if its flags allow it. */
    public function answer(string $id, OwnerRequestAction $action): OwnerRequest
    {
        foreach (Fields::objects($this->fixtures->get('owner/requests'), 'items') as $item) {
            if (($item['id'] ?? null) !== $id) {
                continue;
            }

            $request = OwnerRequest::fromArray($item);
            $status = match (true) {
                $action === OwnerRequestAction::Give && $request->status === ContactRequestStatus::Pending => ContactRequestStatus::Given,
                $action === OwnerRequestAction::Decline && $request->status === ContactRequestStatus::Pending => ContactRequestStatus::Declined,
                $action === OwnerRequestAction::ReasonFound && $request->canReason => ContactRequestStatus::Declined,
                $action === OwnerRequestAction::ReasonAgent && $request->canReason => ContactRequestStatus::Agent,
                $action === OwnerRequestAction::Late && $request->canLate => ContactRequestStatus::Agent,
                $action === OwnerRequestAction::Undo && $request->canUndo => ContactRequestStatus::Pending,
                default => throw new RequestAnswerClosed,
            };

            return OwnerRequest::fromArray(array_merge($item, [
                'status' => $status->value,
                'agent_marked' => $status === ContactRequestStatus::Agent,
                'can_reason' => $status === ContactRequestStatus::Declined && $action === OwnerRequestAction::Decline,
                'can_undo' => $status === ContactRequestStatus::Declined && $action === OwnerRequestAction::Decline,
                'can_late' => $status === ContactRequestStatus::Given,
            ]));
        }

        throw new SourceNotFound('Request not found.');
    }

    /** The city and district of a point: Tashkent and Yunusobod within 0.3° of the reference centre, else none. */
    public function place(float $lat, float $lon): OwnerPlace
    {
        if (abs($lat - 41.2995) <= 0.3 && abs($lon - 69.2401) <= 0.3) {
            $data = $this->fixtures->get('owner/place');

            return new OwnerPlace(Fields::nullableString($data, 'city'), Fields::nullableString($data, 'district_code'));
        }

        return new OwnerPlace(null, null);
    }

    public function demand(SourceContext $context): OwnerDemand
    {
        $data = $this->fixtures->get('owner/demand');
        $few = $context->scenario === 'demand_few';
        // No radar matches while radars are off (DEC-51): `count: 0`, never `few`.
        $radars = Config::boolean('radar.creation_enabled');

        return new OwnerDemand(
            count: ! $radars ? 0 : ($few ? null : Fields::nullableInt($data, 'count')),
            few: $radars && ($few || Fields::bool($data, 'few')),
            usualLowUsd: Fields::nullableInt($data, 'usual_low_usd'),
            usualHighUsd: Fields::nullableInt($data, 'usual_high_usd'),
        );
    }

    /**
     * The entry of a write: `listing_locked` and a held, withdrawn, let or removed listing are locked.
     *
     * @return array<array-key, mixed>
     */
    private function unlocked(string $id, SourceContext $context): array
    {
        $entry = $this->notLockedByScenario($id, $context);

        if (OwnerListing::fromArray($entry)->locked()) {
            throw new OwnerListingLocked;
        }

        return $entry;
    }

    /** @return array<array-key, mixed> */
    private function notLockedByScenario(string $id, SourceContext $context): array
    {
        $entry = $this->entry($id, $context);

        if ($context->scenario === 'listing_locked') {
            throw new OwnerListingLocked;
        }

        return $entry;
    }

    /**
     * The show scenarios of the complete draft (WP-80, "Scenarios").
     *
     * @param  array<array-key, mixed>  $entry
     * @return array<array-key, mixed>
     */
    private function scenario(array $entry, ?SourceContext $context): array
    {
        if ($context === null || $entry['id'] !== self::COMPLETE_DRAFT) {
            return $entry;
        }

        return match ($context->scenario) {
            'phone_set' => array_merge($entry, ['phone_set' => true, 'phone_display' => '+998 00 000-00-81']),
            'phone_not_uz' => array_merge($entry, ['phone_error' => 'not_uz']),
            'phone_not_own' => array_merge($entry, ['phone_error' => 'not_own']),
            'rejected_denied' => array_merge($entry, ['status' => 'rejected', 'reject_reason' => 'denied']),
            'rejected_limit' => array_merge($entry, ['status' => 'rejected', 'reject_reason' => 'limit']),
            'held_check' => array_merge($entry, ['number' => self::NEXT_NUMBER, 'status' => 'paused', 'held' => true, 'hold_reason' => 'check_agent', 'published_at' => null]),
            default => $entry,
        };
    }

    /**
     * @param  array<array-key, mixed>  $value
     * @return array<array-key, mixed>
     */
    private function tokens(array $value): array
    {
        $media = rtrim(Config::string('media.public_url'), '/');

        array_walk_recursive($value, function (mixed &$item) use ($media): void {
            if (is_string($item)) {
                $item = str_replace('{media}', $media, $item);
            }
        });

        return $value;
    }
}
