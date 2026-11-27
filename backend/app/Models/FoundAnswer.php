<?php

namespace App\Models;

use App\Enums\Personal\FoundAnswerType;
use App\Enums\Personal\FoundPlace;
use App\Enums\Personal\FoundTrigger;
use Carbon\CarbonImmutable;
use Database\Factories\FoundAnswerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One answer to «Нашли жильё?» (WP-44): every tap is a row; `where` fills the latest `elsewhere` row without one, or
 * stands alone (no `answer`, no `trigger`).
 *
 * @property int $id
 * @property int $user_id
 * @property FoundAnswerType|null $answer
 * @property FoundTrigger|null $trigger
 * @property FoundPlace|null $where
 * @property CarbonImmutable $created_at
 * @property-read User $user
 */
class FoundAnswer extends Model
{
    /** @use HasFactory<FoundAnswerFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    /** No `user_id`: a row gets its owner only through the user's relation or an explicit insert (review of WP-44 A, F5). */
    protected $fillable = ['answer', 'trigger', 'where'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'answer' => FoundAnswerType::class,
            'trigger' => FoundTrigger::class,
            'where' => FoundPlace::class,
            'created_at' => 'datetime',
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
