<?php

namespace App\Services\Radar;

use App\Enums\Radar\HideRuleKind;
use App\Exceptions\Radar\RadarsDisabled;
use App\Models\ListingRef;
use App\Models\Radar;
use App\Models\RadarHideRule;
use App\Models\User;
use App\Services\Personal\ListingResolver;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;

/**
 * The hide rules of radars (WP-45; task `KV-BE-106`): per radar (DEV-034), cleared all at once (DEV-033).
 *
 * - `add()` and `addFromListing()` are radar writes: while radars are switched off (`radar.creation_enabled`, DEC-51)
 *   they answer `RadarsDisabled` before any query, so the bot cannot write a rule around the switch either.
 * - `add()`: idempotent (`insertOrIgnore` on the unique radar, kind and target), for a radar found through the user's
 *   radars; a channel is stored without `@`, in lower case. `false` when nothing can be stored: a blank target or one
 *   longer than 96 characters, or an `author` rule while `radar.author_hide_rules` is off.
 * - `addFromListing()`: the bot's «Скрыть похожие» (WP-53). The target is what `listing_refs` files for the listing's
 *   survivor (`ListingResolver::survivor()`): its channel, district code or author key — no source call, so the stub
 *   driver, which files nothing, adds nothing. With the card's radar the rule goes there; without one, to every active
 *   radar of the user (Q-BOT-028). `false` when there is no target or no radar to take it.
 * - `clearAll()`: deletes the radar's rules and sets `hidden_count` to 0, for `RadarService::unhide()` only, which
 *   checks the switch and the owner and holds the user's lock (`PATCH {"unhide": true}`).
 * - `rulesFor()`: one query, the `HideRuleSet` of the starter, the previews and WP-46's matcher.
 *
 * The target of an `author` rule is personal data (an author key): nothing here logs a target.
 */
final readonly class RadarHideRuleService
{
    /** The width of `radar_hide_rules.target`. */
    public const int MAX_TARGET = 96;

    public function __construct(private ListingResolver $resolver) {}

    public function add(User $user, Radar $radar, HideRuleKind $kind, string $target): bool
    {
        $this->ensureEnabled();

        return $this->store([$this->owned($user, $radar)->id], $kind, $target);
    }

    public function addFromListing(User $user, int $number, HideRuleKind $kind, ?Radar $origin): bool
    {
        $this->ensureEnabled();
        $radarIds = $origin !== null
            ? [$this->owned($user, $origin)->id]
            : array_values($user->radars()->where('active', true)->pluck('id')->map(fn (mixed $id): string => (string) $id)->all());

        if ($radarIds === [] || ($kind === HideRuleKind::Author && ! Config::boolean('radar.author_hide_rules'))) {
            return false;
        }

        $ref = ListingRef::query()->find($this->resolver->survivor($number));
        $target = match ($kind) {
            HideRuleKind::Channel => $ref?->source_channel,
            HideRuleKind::District => $ref?->district_code,
            HideRuleKind::Author => $ref?->author_key,
        };

        return $target !== null && $this->store($radarIds, $kind, $target);
    }

    /**
     * @internal callers go through `RadarService::unhide()`, which checks the switch and the owner and holds the user's
     *           lock; this method checks none of them.
     */
    public function clearAll(Radar $radar): void
    {
        DB::transaction(function () use ($radar): void {
            $radar->hideRules()->delete();
            Radar::query()->whereKey($radar->getKey())->update(['hidden_count' => 0]);
        });

        $radar->hidden_count = 0;
        $radar->syncOriginalAttribute('hidden_count');
    }

    public function rulesFor(Radar $radar): HideRuleSet
    {
        return HideRuleSet::of($radar->hideRules()->get());
    }

    /**
     * The rules of several radars in one query (the list's previews).
     *
     * @param  list<string>  $radarIds
     * @return array<string, HideRuleSet> by radar id; a radar without rules has an empty set
     */
    public function rulesForMany(array $radarIds): array
    {
        if ($radarIds === []) {
            return [];
        }

        $rules = RadarHideRule::query()->whereIn('radar_id', $radarIds)->get()->groupBy('radar_id');

        return array_combine($radarIds, array_map(fn (string $id): HideRuleSet => HideRuleSet::of($rules->get($id, [])), $radarIds));
    }

    /** @param  list<string>  $radarIds */
    private function store(array $radarIds, HideRuleKind $kind, string $target): bool
    {
        $target = $kind === HideRuleKind::Channel ? HideRuleSet::channel($target) : trim($target);

        if ($target === '' || mb_strlen($target) > self::MAX_TARGET) {
            return false;
        }

        if ($kind === HideRuleKind::Author && ! Config::boolean('radar.author_hide_rules')) {
            return false;
        }

        $now = now();
        RadarHideRule::query()->insertOrIgnore(array_map(fn (string $radarId): array => [
            'radar_id' => $radarId,
            'kind' => $kind->value,
            'target' => $target,
            'created_at' => $now,
        ], $radarIds));

        return true;
    }

    private function ensureEnabled(): void
    {
        if (! Config::boolean('radar.creation_enabled')) {
            throw new RadarsDisabled;
        }
    }

    /** The radar through the user's radars: a radar of another user is not found, like an unknown one. */
    private function owned(User $user, Radar $radar): Radar
    {
        return $user->radars()->whereKey($radar->getKey())->first()
            ?? throw (new ModelNotFoundException)->setModel(Radar::class, [(string) $radar->getKey()]);
    }
}
