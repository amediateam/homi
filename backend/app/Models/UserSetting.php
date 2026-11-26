<?php

namespace App\Models;

use App\Enums\CardStyle;
use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use Carbon\CarbonImmutable;
use Database\Factories\UserSettingFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user's settings (WP-40): one row per user, keyed by the user. `App\Services\Identity\SettingsService` is the only
 * writer; read them through it as `UserSettingsData`. The quiet hours are two Asia/Tashkent wall-clock times
 * (`HH:MM:SS`, both null when off), `digest_hours` the sorted whole hours of the digest.
 *
 * @property int $user_id
 * @property Locale $locale
 * @property CarbonImmutable|null $locale_chosen_at
 * @property Currency $currency
 * @property Theme $theme
 * @property string|null $city
 * @property CarbonImmutable|null $city_chosen_at
 * @property string|null $quiet_start
 * @property string|null $quiet_end
 * @property list<int> $digest_hours
 * @property CardStyle $card_style
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read User $user
 */
class UserSetting extends Model
{
    /** @use HasFactory<UserSettingFactory> */
    use HasFactory;

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $fillable = [
        'user_id', 'locale', 'locale_chosen_at', 'currency', 'theme', 'city', 'city_chosen_at',
        'quiet_start', 'quiet_end', 'digest_hours', 'card_style',
    ];

    /**
     * The column default, so a new instance reads as the row it becomes.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'card_style' => CardStyle::Classic->value,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'locale' => Locale::class,
            'locale_chosen_at' => 'datetime',
            'currency' => Currency::class,
            'theme' => Theme::class,
            'city_chosen_at' => 'datetime',
            'digest_hours' => 'array',
            'card_style' => CardStyle::class,
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
