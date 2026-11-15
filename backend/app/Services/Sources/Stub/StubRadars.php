<?php

namespace App\Services\Sources\Stub;

use App\Enums\RadarMode;
use App\Enums\RadarMutationKind;
use App\Exceptions\Sources\SourceNotFound;
use App\Services\Radars\Radar;
use App\Services\Radars\RadarMutation;
use App\Services\Radars\RadarOption;
use App\Services\Radars\RadarPreview;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\Fields;
use App\Services\Sources\SourceContext;
use InvalidArgumentException;

/**
 * The radar stubs (WP-13; HOMI's radars from WP-45), stateless: `radars/list.json` holds three radars (one paused,
 * one digest, one with `hidden: 3`), `radars/list.previews.json` their previews (listing numbers of the WP-12
 * catalogue, resolved through the card source), and the mutation fixtures the scenario bodies. A write answers with
 * the radar it would have made and changes nothing.
 */
final class StubRadars
{
    public function __construct(private readonly FixtureStore $fixtures, private readonly StubListingRefs $refs) {}

    /**
     * The radars in creation order, with their previews when asked.
     *
     * @return list<Radar>
     */
    public function list(SourceContext $context, bool $withPreviews): array
    {
        $radars = array_map(fn (array $data): Radar => $this->radar($data, SearchFilters::fromNormalised(Fields::object($data, 'filters'))), $this->objects('radars/list'));

        if (! $withPreviews) {
            return $radars;
        }

        $previews = $this->fixtures->get('radars/list.previews');

        return array_map(fn (Radar $radar): Radar => $radar->withPreview($this->preview($previews[$radar->id] ?? null, $context)), $radars);
    }

    /** A radar of the list by id; any other id answers like a missing one (SEC-REQ-014). */
    public function find(string $id): Radar
    {
        foreach ($this->list(SourceContext::system(), false) as $radar) {
            if ($radar->id === strtoupper($id)) {
                return $radar;
            }
        }

        throw new SourceNotFound('Radar not found.');
    }

    /** The mutation result of a fixture, with the given filters; `$radar` replaces the fixture's radar (`PUT`). */
    public function mutation(string $fixture, SearchFilters $filters, ?Radar $radar = null): RadarMutation
    {
        $data = $this->fixtures->get($fixture);
        $radar = $radar === null ? $this->radar(Fields::object($data, 'radar'), $filters) : $radar->with(filters: $filters);

        return new RadarMutation(
            radar: $radar,
            kind: RadarMutationKind::from(Fields::string($data, 'kind')),
            starter: Fields::count($data, 'starter'),
            options: $this->options($data),
            relaxed: array_map(fn (array $item): string => Fields::string($item, 'text'), Fields::objects($data, 'relaxed')),
        );
    }

    /** The `starter` of `radars/patched.json` or `radars/relaxed.json`. */
    public function starter(string $fixture): int
    {
        return Fields::count($this->fixtures->get($fixture), 'starter');
    }

    /**
     * The option codes a radar offers to widen it (the options of `radars/few.json`).
     *
     * @return list<string>
     */
    public function optionCodes(): array
    {
        return array_map(fn (RadarOption $option): string => $option->code, $this->options($this->fixtures->get('radars/few')));
    }

    /** @param  array<array-key, mixed>  $data */
    private function radar(array $data, SearchFilters $filters): Radar
    {
        return new Radar(
            id: Fields::string($data, 'id'),
            active: Fields::bool($data, 'active'),
            mode: RadarMode::from(Fields::string($data, 'mode')),
            hidden: Fields::count($data, 'hidden'),
            createdAt: Fields::string($data, 'created_at'),
            filters: $filters,
        );
    }

    private function preview(mixed $data, SourceContext $context): ?RadarPreview
    {
        if ($data === null) {
            return null;
        }

        if (! is_array($data)) {
            throw new InvalidArgumentException('A radar preview of radars/list.previews must be an object or null.');
        }

        $flow = Fields::nullableObject($data, 'flow');
        $numbers = Fields::ints($data, 'items');

        return new RadarPreview(
            items: array_slice($this->refs->previews($numbers, $context), 0, 5),
            count: Fields::nullableInt($data, 'count'),
            flowWeek: $flow === null ? null : Fields::count($flow, 'week'),
            flowDays: $flow === null ? null : Fields::count($flow, 'days'),
        );
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return list<RadarOption>
     */
    private function options(array $data): array
    {
        return array_map(fn (array $option): RadarOption => new RadarOption(
            code: Fields::string($option, 'code'),
            label: Fields::string($option, 'label'),
            rate: Fields::string($option, 'rate'),
            count: Fields::nullableInt($option, 'count'),
        ), Fields::objects($data, 'options'));
    }

    /** @return list<array<array-key, mixed>> */
    private function objects(string $fixture): array
    {
        return Fields::objects(['list' => $this->fixtures->get($fixture)], 'list');
    }
}
