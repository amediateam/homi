<?php

namespace App\Services\Radar;

use App\Enums\Radar\RadarMutationKind;
use App\Enums\RadarMode;
use App\Events\Radar\RadarDeleted;
use App\Events\Radar\RadarSaved;
use App\Exceptions\Radar\NoChat;
use App\Exceptions\Radar\RadarDuplicate;
use App\Exceptions\Radar\RadarLimit;
use App\Exceptions\Radar\RadarsDisabled;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\Radar;
use App\Models\User;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\FlowOption;
use App\Services\Sources\SourceContext;
use Closure;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Every change of a radar, for the API and the bot alike (WP-45; tasks `KV-BE-100`, `KV-BE-103`, `KV-BE-104`). Each
 * write runs in this order:
 *
 * 0. The switch (DEC-51): while `radar.creation_enabled` is off, `create`, `update`, `setActive`, `setMode`, `relax`
 *    and `unhide` answer `RadarsDisabled` before anything else — no chat check, no lock, no query, no source call
 *    (`RadarHideRuleService::add()` and `addFromListing()` too). `delete` is never
 *    refused. The API's `EnsureRadarsEnabled` has answered already; the bot calls this service directly. Then the
 *    owner: a radar given for another user is `ModelNotFoundException`, as unknown — an attribute comparison, before
 *    the chat check, the lock or any query (`delete` too).
 * 1. The chat (`ChatReachability`): with `radar.require_chat` on, `create`, `update`, `setActive(true)` and `relax`
 *    answer `NoChat` while the bot cannot write to the user — read from the loaded user, before any lock, source call
 *    or write, so the client's single repeat after the user grants access writes exactly one radar (LB-API-013).
 *    Pause, mode, unhide and delete are never checked.
 * 2. The lock: one per user for the transaction — `pg_advisory_xact_lock(hashtext('radar:' || <user id>))` on
 *    PostgreSQL, `Cache::lock("radar:<user id>", 5)->block(3)` elsewhere. Inside it the radar is read again through
 *    the user's radars (one deleted meanwhile is `ModelNotFoundException`, as unknown); `relax` resolves its code
 *    against that copy (`RadarRelaxOptions::filtersFor()`: the remembered set, else one source round under the lock;
 *    `422` on `code` otherwise).
 * 3. The twin: the canonical hash of the filters (`posted_days`, key order and list order ignored) among the user's
 *    radars. `create`: an active twin is `existing` and nothing is written; a paused one is switched on as
 *    `reactivated` and stores the body's filters (a new `posted_days` with them, DEV-005), the new `entry` and
 *    `relax_code`. `update` and `relax`: another radar's hash is `RadarDuplicate`; filters equal to the stored ones
 *    write nothing, while its own hash with other filters — a new `posted_days`, another order of a list or of the
 *    polygon's vertices — is stored as received, a write like any other. The unique (`user_id`, `filters_hash`) is the
 *    backstop: an insert that loses re-reads the winner (`createOrFirst`, inside a savepoint on PostgreSQL).
 * 4. The limit: `radar.max` radars switched on (`radar.limit_scope` `active`; `total` counts every radar). Creating or
 *    switching on beyond it is `RadarLimit`; pause, mode and delete are never limited, and lowering the limit keeps the
 *    radars a user has. A new radar (not a twin, which writes no row) is also refused with `RadarLimit` once the user
 *    has `radar.max_total` radars, switched on and paused together (DEC-113; its message names the total); resume,
 *    replace, mode, relax and delete are never checked against it, and radars above a lowered cap are kept.
 * 5. The write. After the transaction the starter (`StarterSelector`): `forCreate` for a new radar, `forResume` for a
 *    radar switched on (`reactivated` too), `forUpdate` for an active radar's new filters, `forRelax` after a relax;
 *    then, after the transaction (and any transaction around it) commits, `RadarSaved` with the starter's numbers, or
 *    `RadarDeleted`. Nothing is announced for a write that changed nothing or for a mode change.
 * 6. The options (`RadarRelaxOptions::offer()`): a create (`created`, `reactivated`) or a replace that stored new
 *    filters, whose starter is empty, carries the source's ways to widen the radar and the `relaxed` hints — one flow
 *    call after the transaction, outside the lock; `existing`, an unchanged replace, a relax, a switch and a mode
 *    change carry none. New filters and a relax forget the radar's remembered set inside the lock, a delete after it.
 *
 * `update` replaces the filters and keeps `active`; `setActive(false)` sets `paused_at`. The locale and currency of a
 * starter and of the options are the write's, else the user's settings, else `ru` and `USD`. Whatever fails after the
 * commit — the starter, the options, forgetting the remembered set — the write stands, answers normally with an empty
 * starter or no options and is announced: `RadarSaved` is dispatched after the reads, `RadarDeleted` inside the
 * delete's transaction (both fire on commit). No filters text and no author key is logged (SEC-REQ-047).
 */
final readonly class RadarService
{
    /** How long the cache lock of a user's radar writes is held at most, and how long a write waits for it (s). */
    private const int LOCK_SECONDS = 5;

    private const int LOCK_WAIT_SECONDS = 3;

    public function __construct(
        private ChatReachability $chat,
        private StarterSelector $starters,
        private RadarRelaxOptions $options,
        private RadarHideRuleService $hideRules,
    ) {}

    /**
     * Creates a radar for the filters, or answers the user's radar of the same search: `existing` while it is on,
     * `reactivated` when it was paused and is now on.
     */
    public function create(User $user, SearchFilters $filters, RadarCreateContext $context): RadarMutation
    {
        $this->ensureEnabled();
        $this->ensureChat($user);

        /** @var array{0: Radar, 1: RadarMutationKind} $result */
        $result = $this->locked($user, function () use ($user, $filters, $context): array {
            $hash = $filters->canonicalHash();
            $twin = $user->radars()->where('filters_hash', $hash)->first();

            if ($twin === null) {
                $this->ensureBelowTotal($user);
                $this->ensureBelowLimit($user, null);
                $radar = $user->radars()->createOrFirst(['filters_hash' => $hash], [
                    ...Radar::filterAttributes($filters),
                    'entry' => $context->entry,
                    'relax_code' => $context->relaxed,
                ]);

                if ($radar->wasRecentlyCreated) {
                    return [$radar, RadarMutationKind::Created];
                }

                $twin = $radar;
            }

            if ($twin->active) {
                return [$twin, RadarMutationKind::Existing];
            }

            $this->ensureBelowLimit($user, $twin);
            $twin->forceFill([...Radar::filterAttributes($filters), 'active' => true, 'paused_at' => null, 'entry' => $context->entry, 'relax_code' => $context->relaxed])->save();

            return [$twin, RadarMutationKind::Reactivated];
        });
        [$radar, $kind] = $result;
        $starter = $this->starter($radar, $kind, fn (): Starter => $kind === RadarMutationKind::Created
            ? $this->starters->forCreate($user, $radar, $context->locale, $context->currency)
            : $this->starters->forResume($user, $radar, $context->locale, $context->currency));
        [$options, $relaxed] = $kind !== RadarMutationKind::Existing && $starter->count === 0
            ? $this->offered($radar, $this->context($user, $context->locale, $context->currency))
            : [[], []];

        return $this->announced($user, new RadarMutation($radar, $kind, $starter, $options, $relaxed, changed: $kind !== RadarMutationKind::Existing));
    }

    /**
     * Replaces the filters of the radar and keeps whether it is on; `$relaxed` is stored as `relax_code` (statistics
     * only). Filters of another radar's search are `RadarDuplicate`; filters equal to the stored ones write nothing,
     * and the same search with another `posted_days` is stored as received.
     */
    public function update(User $user, Radar $radar, SearchFilters $filters, ?string $relaxed, ?string $locale = null, ?string $currency = null): RadarMutation
    {
        $this->ensureEnabled();
        $this->ensureOwned($user, $radar);
        $this->ensureChat($user);

        [$current, $written] = $this->replaced($user, $radar, $filters, $relaxed);
        $context = $this->context($user, $locale, $currency);
        $starter = $this->replacedStarter($current, $written, fn (): Starter => $this->starters->forUpdate($user, $current, $context->locale, $context->currency));
        [$options, $hints] = $written && $starter->count === 0 ? $this->offered($current, $context) : [[], []];

        return $this->announced($user, new RadarMutation($current, RadarMutationKind::Updated, $starter, $options, $hints, changed: $written));
    }

    /**
     * Widens the radar by a code its options offered (`RadarRelaxOptions::filtersFor()`; any other code is `422` on
     * `code`) by the rules of `update`, the code stored as `relax_code`; the answer carries the new starter
     * (`forRelax`). The code is resolved under the user's lock against the radar as stored then, not against the copy
     * given, so two relaxes in a row — or overlapping, or one from a copy loaded before another write — relax twice,
     * each from the then-current filters. A remembered set costs a cache read; only when it is missing is it computed
     * again, and that source round runs under the lock.
     */
    public function relax(User $user, Radar $radar, string $code, ?string $locale = null, ?string $currency = null): RadarMutation
    {
        $this->ensureEnabled();
        $this->ensureOwned($user, $radar);
        $this->ensureChat($user);

        $context = $this->context($user, $locale, $currency);
        [$current, $written] = $this->replaced($user, $radar, fn (Radar $stored): SearchFilters => $this->options->filtersFor($stored, $code, $context), $code);
        $starter = $this->replacedStarter($current, $written, fn (): Starter => $this->starters->forRelax($user, $current, $context->locale, $context->currency));

        return $this->announced($user, new RadarMutation($current, RadarMutationKind::Updated, $starter, changed: $written));
    }

    /**
     * Switches the radar on (`resumed`, within the limit and after the chat check) or pauses it (`paused`); a radar
     * already in that state writes nothing and answers `changed: false`, so a no-op pause asks no «Нашли жильё?».
     */
    public function setActive(User $user, Radar $radar, bool $active): RadarMutation
    {
        $this->ensureEnabled();
        $this->ensureOwned($user, $radar);

        if ($active) {
            $this->ensureChat($user);
        }

        /** @var array{0: Radar, 1: bool} $result */
        $result = $this->locked($user, function () use ($user, $radar, $active): array {
            $current = $this->stored($user, $radar);

            if ($current->active === $active) {
                return [$current, false];
            }

            if ($active) {
                $this->ensureBelowLimit($user, $current);
            }

            $current->forceFill(['active' => $active, 'paused_at' => $active ? null : now()])->save();

            return [$current, true];
        });
        [$current, $written] = $result;
        $kind = $active ? RadarMutationKind::Resumed : RadarMutationKind::Paused;
        $starter = $written && $active
            ? $this->starter($current, $kind, fn (): Starter => $this->starters->forResume($user, $current))
            : Starter::none();

        return $this->announced($user, new RadarMutation($current, $kind, $starter, changed: $written));
    }

    /** Switches between sending each listing at once and the digest; never limited, never checks the chat. */
    public function setMode(User $user, Radar $radar, RadarMode $mode): Radar
    {
        $this->ensureEnabled();
        $this->ensureOwned($user, $radar);

        /** @var Radar */
        return $this->locked($user, function () use ($user, $radar, $mode): Radar {
            $current = $this->stored($user, $radar);

            if ($current->mode !== $mode) {
                $current->forceFill(['mode' => $mode])->save();
            }

            return $current;
        });
    }

    /**
     * Clears every hide rule of the radar and sets its `hidden_count` to 0 (`PATCH {"unhide": true}`, DEV-033; the bot's
     * radar screen, WP-55): the switch and the owner first, then under the user's lock on the radar as stored
     * (`RadarHideRuleService::clearAll()`); the answer is that radar. Never checks the chat, never limited, announces
     * nothing.
     */
    public function unhide(User $user, Radar $radar): Radar
    {
        $this->ensureEnabled();
        $this->ensureOwned($user, $radar);

        /** @var Radar */
        return $this->locked($user, function () use ($user, $radar): Radar {
            $current = $this->stored($user, $radar);
            $this->hideRules->clearAll($current);

            return $current;
        });
    }

    /** Deletes the radar with its hide rules; works while radars are switched off, so nothing is left behind. */
    public function delete(User $user, Radar $radar): void
    {
        $this->ensureOwned($user, $radar);
        $this->locked($user, function () use ($user, $radar): void {
            $this->stored($user, $radar)->delete();
            RadarDeleted::dispatch((string) $radar->getKey(), $user->id);
        });

        $this->forgetOptions($radar);
    }

    /**
     * The replace of `update` and `relax` under the lock (steps 2 and 3): the radar as stored now and whether new
     * filters were written. `$next` is the new filters, or (for `relax`) how to compute them from the radar as stored
     * under the lock. A write forgets the radar's remembered options inside the lock, before it commits, so a relax
     * waiting for the lock never reads a set offered for the filters replaced; a cache failure there is reported and
     * keeps the write.
     *
     * @param  SearchFilters|Closure(Radar): SearchFilters  $next
     * @return array{0: Radar, 1: bool}
     */
    private function replaced(User $user, Radar $radar, SearchFilters|Closure $next, ?string $relaxCode): array
    {
        /** @var array{0: Radar, 1: bool} */
        return $this->locked($user, function () use ($user, $radar, $next, $relaxCode): array {
            $current = $this->stored($user, $radar);
            $filters = $next instanceof Closure ? $next($current) : $next;
            $hash = $filters->canonicalHash();

            if ($hash === $current->filters_hash && $filters->toArray() === $current->searchFilters()->toArray()) {
                return [$current, false];
            }

            if ($user->radars()->where('filters_hash', $hash)->whereKeyNot($current->getKey())->exists()) {
                throw new RadarDuplicate;
            }

            try {
                $current->forceFill([...Radar::filterAttributes($filters), 'relax_code' => $relaxCode])->save();
            } catch (UniqueConstraintViolationException $e) {
                throw new RadarDuplicate(previous: $e);
            }

            $this->forgetOptions($current);

            return [$current, true];
        });
    }

    /**
     * The starter of a replace: only an active radar's new filters send anything.
     *
     * @param  Closure(): Starter  $select
     */
    private function replacedStarter(Radar $radar, bool $written, Closure $select): Starter
    {
        return $written && $radar->active ? $this->starter($radar, RadarMutationKind::Updated, $select) : Starter::none();
    }

    /**
     * The options and `relaxed` hints of a write whose starter is empty (step 6), read after the commit: empty when
     * they cannot be read, so the write still answers and is announced — the source's `SourceUnavailable` is logged
     * with the radar's id, any other failure reported; never its filters.
     *
     * @return array{0: list<FlowOption>, 1: list<string>}
     */
    private function offered(Radar $radar, SourceContext $context): array
    {
        try {
            return $this->options->offer($radar, $context);
        } catch (SourceUnavailable) {
            Log::warning('Radar relax options unavailable; the write is kept without options.', ['radar' => (string) $radar->getKey()]);
        } catch (Throwable $e) {
            report($e);
        }

        return [[], []];
    }

    /**
     * Forgets the radar's remembered options; a cache failure is reported and does not fail the write, which has
     * committed and is announced.
     */
    private function forgetOptions(Radar $radar): void
    {
        try {
            $this->options->forget($radar);
        } catch (Throwable $e) {
            report($e);
        }
    }

    /** The context of a starter or the options: the write's locale and currency, else the user's settings. */
    private function context(User $user, ?string $locale, ?string $currency): SourceContext
    {
        return new SourceContext($locale ?? $user->settings?->locale->value ?? 'ru', $currency ?? $user->settings?->currency->value ?? 'USD', $user);
    }

    private function ensureEnabled(): void
    {
        if (! Config::boolean('radar.creation_enabled')) {
            throw new RadarsDisabled;
        }
    }

    /**
     * A radar of another user is not found, like an unknown one: an attribute comparison, so it answers before the chat
     * check, the lock and any query, and a caller that loaded a radar by id outside the user's relation (the bot) learns
     * nothing from the order of the checks.
     */
    private function ensureOwned(User $user, Radar $radar): void
    {
        if ($radar->user_id !== $user->id) {
            throw (new ModelNotFoundException)->setModel(Radar::class, [(string) $radar->getKey()]);
        }
    }

    private function ensureChat(User $user): void
    {
        if (Config::boolean('radar.require_chat') && ! $this->chat->canWrite($user)) {
            throw new NoChat;
        }
    }

    /** The limit of step 4; `$resuming` is the paused radar being switched on, which `total` already counts. */
    private function ensureBelowLimit(User $user, ?Radar $resuming): void
    {
        $max = Config::integer('radar.max');
        $radars = $user->radars();

        if (Config::string('radar.limit_scope') === 'total') {
            if ($resuming !== null) {
                $radars->whereKeyNot($resuming->getKey());
            }
        } else {
            $radars->where('active', true);
        }

        if ($radars->count() >= $max) {
            throw new RadarLimit($max);
        }
    }

    /**
     * The total cap of step 4 (DEC-113): a new row is refused once the user has `radar.max_total` radars, switched on
     * and paused together. Only `create` of a new radar asks; a twin writes no row.
     */
    private function ensureBelowTotal(User $user): void
    {
        $max = Config::integer('radar.max_total');

        if ($user->radars()->count() >= $max) {
            throw RadarLimit::total($max);
        }
    }

    /** The radar as stored now, through the user's radars: one query for an own, a foreign and a deleted radar. */
    private function stored(User $user, Radar $radar): Radar
    {
        return $user->radars()->whereKey($radar->getKey())->first()
            ?? throw (new ModelNotFoundException)->setModel(Radar::class, [(string) $radar->getKey()]);
    }

    /**
     * Runs the write in one transaction under the user's lock (step 2).
     *
     * @template TResult
     *
     * @param  Closure(): TResult  $write
     * @return TResult
     */
    private function locked(User $user, Closure $write): mixed
    {
        $transaction = fn (): mixed => DB::transaction(function () use ($user, $write): mixed {
            if (DB::getDriverName() === 'pgsql') {
                DB::select("select pg_advisory_xact_lock(hashtext('radar:' || ?))", [(string) $user->id]);
            }

            return $write();
        });

        if (DB::getDriverName() === 'pgsql') {
            return $transaction();
        }

        return Cache::lock("radar:{$user->id}", self::LOCK_SECONDS)->block(self::LOCK_WAIT_SECONDS, $transaction);
    }

    /**
     * The starter of a committed write (step 5 of the class): `existing`, a pause, a mode change, an unchanged search
     * and a paused radar's new filters send nothing (`Starter::none()`, no source call). Read after the transaction,
     * outside the lock; when it cannot be read, the write stands, is announced and the starter is empty — the source's
     * `SourceUnavailable` is logged with the radar's id and the kind, any other failure (the overlay's reads, the
     * delivered set, a data mapping) reported; never its filters.
     *
     * @param  Closure(): Starter  $select
     */
    private function starter(Radar $radar, RadarMutationKind $kind, Closure $select): Starter
    {
        if ($kind === RadarMutationKind::Existing) {
            return Starter::none();
        }

        try {
            return $select();
        } catch (SourceUnavailable) {
            Log::warning('Radar starter unavailable; the write is kept with an empty starter.', ['radar' => (string) $radar->getKey(), 'kind' => $kind->value]);
        } catch (Throwable $e) {
            report($e);
        }

        return Starter::none();
    }

    /** The mutation, announced by `RadarSaved` after the commit when it wrote something (`changed`). */
    private function announced(User $user, RadarMutation $mutation): RadarMutation
    {
        if ($mutation->changed) {
            RadarSaved::dispatch((string) $mutation->radar->getKey(), $user->id, $mutation->kind, $mutation->starter->numbers);
        }

        return $mutation;
    }
}
