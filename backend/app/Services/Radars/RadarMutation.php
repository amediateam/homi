<?php

namespace App\Services\Radars;

use App\Enums\Radar\RadarMutationKind as ServiceKind;
use App\Enums\RadarMutationKind;
use App\Services\Radar\RadarMutation as ServiceMutation;
use App\Services\Sources\Data\FlowOption;
use LogicException;

/**
 * The result of `POST /radars` and `PUT /radars/{id}` (WP-13): the radar, what happened (`created`, `existing`,
 * `reactivated`, `updated`), how many matching listings went to the chat now, ways to widen it (only when `starter`
 * is 0) and the texts of the relaxed rules. `fromService()` answers a write of `RadarService` (WP-45).
 */
final readonly class RadarMutation
{
    /**
     * @param  list<RadarOption>  $options
     * @param  list<string>  $relaxed
     */
    public function __construct(
        public Radar $radar,
        public RadarMutationKind $kind,
        public int $starter,
        public array $options,
        public array $relaxed,
    ) {}

    /**
     * The answer of a create or a replace of `RadarService`: its six kinds narrowed to the four of the contract — a
     * switch-on or a pause is the answer of `PATCH` (`RadarChange`), never of these two methods.
     */
    public static function fromService(ServiceMutation $mutation): self
    {
        return new self(
            radar: Radar::fromModel($mutation->radar),
            kind: self::kind($mutation->kind),
            starter: $mutation->starter->count,
            options: array_map(fn (FlowOption $option): RadarOption => new RadarOption($option->code, $option->label, $option->rate, $option->count), $mutation->options),
            relaxed: $mutation->relaxed,
        );
    }

    /** The contract's `kind` of a service kind of `POST /radars` or `PUT /radars/{id}`. */
    public static function kind(ServiceKind $kind): RadarMutationKind
    {
        return match ($kind) {
            ServiceKind::Created => RadarMutationKind::Created,
            ServiceKind::Existing => RadarMutationKind::Existing,
            ServiceKind::Reactivated => RadarMutationKind::Reactivated,
            ServiceKind::Updated => RadarMutationKind::Updated,
            ServiceKind::Resumed, ServiceKind::Paused => throw new LogicException("A {$kind->value} radar is an answer of PATCH /radars/{id}."),
        };
    }
}
