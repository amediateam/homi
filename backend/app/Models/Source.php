<?php

namespace App\Models;

use Database\Factories\SourceFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Laravel\Sanctum\HasApiTokens;

/**
 * A collector that pushes listings into HOMI (ADR-0009). Authenticates with Sanctum tokens
 * carrying the `intake:write` ability; one token per environment, issued by `intake:token`.
 *
 * @property int $id
 * @property string $code
 * @property string $name
 * @property string $trust_weight
 * @property bool $is_active
 */
class Source extends Model
{
    use HasApiTokens;

    /** @use HasFactory<SourceFactory> */
    use HasFactory;

    protected $fillable = ['code', 'name', 'trust_weight', 'is_active'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'trust_weight' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    /**
     * @return HasMany<SourceListing, $this>
     */
    public function listings(): HasMany
    {
        return $this->hasMany(SourceListing::class);
    }
}
