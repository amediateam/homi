<?php

namespace App\Models;

use App\Enums\TelegramUpdateStatus;
use Carbon\CarbonImmutable;
use Database\Factories\TelegramUpdateFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;

/**
 * One accepted Telegram update; the unique (bot_id, update_id) pair is the dedup key.
 *
 * @property int $id
 * @property int $bot_id
 * @property int $update_id
 * @property array<string, mixed> $payload
 * @property TelegramUpdateStatus $status
 * @property string|null $error
 * @property CarbonImmutable|null $processed_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 */
class TelegramUpdate extends Model
{
    /** @use HasFactory<TelegramUpdateFactory> */
    use HasFactory;

    use Prunable;

    protected $fillable = ['bot_id', 'update_id', 'payload', 'status', 'error', 'processed_at'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'bot_id' => 'integer',
            'update_id' => 'integer',
            'payload' => 'array',
            'status' => TelegramUpdateStatus::class,
            'processed_at' => 'immutable_datetime',
        ];
    }

    /**
     * Rows older than telegram.updates_retention_days are pruned by `model:prune`.
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        return static::query()->where('created_at', '<', now()->subDays((int) config('telegram.updates_retention_days', 14)));
    }
}
