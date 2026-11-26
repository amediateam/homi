<?php

namespace App\Models;

use App\Enums\Access\AccessGrantState;
use App\Enums\Access\AdmittedVia;
use Carbon\CarbonImmutable;
use Database\Factories\AccessGrantFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user's standing at the access gate (WP-40): one row per user, keyed by the user. The gate's seat admission and the
 * commands `access:block` and `access:unblock` write it; every writer calls `AccessGate::forget()` afterwards, so the
 * cached decision does not outlive the change. `admitted_via` is null on a grant blocked before any admission.
 *
 * @property int $user_id
 * @property AccessGrantState $state
 * @property AdmittedVia|null $admitted_via
 * @property CarbonImmutable|null $flagged_at
 * @property string|null $flag_reason
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read User $user
 */
class AccessGrant extends Model
{
    /** @use HasFactory<AccessGrantFactory> */
    use HasFactory;

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $fillable = ['user_id', 'state', 'admitted_via', 'flagged_at', 'flag_reason'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'state' => AccessGrantState::class,
            'admitted_via' => AdmittedVia::class,
            'flagged_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
