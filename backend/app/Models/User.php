<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\Identity\BotChatState;
use Carbon\CarbonImmutable;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

/**
 * A HOMI user. Since WP-40 a user is a Telegram user of HOMI's bot: `telegram_user_id` and the launch facts are written
 * by `App\Services\Identity\UserResolver`, which never stores a name, a username or a photo address; `name`, `email`
 * and `password` stay null for such a user. `analytics_distinct_id` is a random UUID given on creation.
 *
 * @property int $id
 * @property string|null $name
 * @property string|null $email
 * @property CarbonImmutable|null $email_verified_at
 * @property string|null $password
 * @property string|null $remember_token
 * @property int|null $telegram_user_id
 * @property bool $is_premium
 * @property bool $has_username
 * @property bool $has_photo
 * @property string|null $language_code
 * @property BotChatState $bot_chat_state
 * @property string $analytics_distinct_id
 * @property bool $is_team
 * @property string|null $first_start_param
 * @property CarbonImmutable|null $last_seen_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read UserSetting|null $settings
 * @property-read AccessGrant|null $accessGrant
 */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The column defaults, so a new instance reads as the row it becomes.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'is_premium' => false,
        'has_username' => false,
        'has_photo' => false,
        'bot_chat_state' => BotChatState::Never->value,
        'is_team' => false,
    ];

    /** Gives every new user its analytics id, so a factory user and the stub user get one too. */
    protected static function booted(): void
    {
        static::creating(function (User $user): void {
            if (blank($user->analytics_distinct_id)) {
                $user->analytics_distinct_id = (string) Str::uuid();
            }
        });
    }

    /**
     * The user's settings row (WP-40); read and write it through `App\Services\Identity\SettingsService`, which
     * creates it with the defaults when it is missing.
     *
     * @return HasOne<UserSetting, $this>
     */
    public function settings(): HasOne
    {
        return $this->hasOne(UserSetting::class);
    }

    /**
     * The user's standing at the access gate (WP-40), if any; `App\Services\Access\AccessGate` reads it fresh on each
     * decision instead of through this relation, whose loaded value would outlive a change.
     *
     * @return HasOne<AccessGrant, $this>
     */
    public function accessGrant(): HasOne
    {
        return $this->hasOne(AccessGrant::class);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'telegram_user_id' => 'integer',
            'is_premium' => 'boolean',
            'has_username' => 'boolean',
            'has_photo' => 'boolean',
            'bot_chat_state' => BotChatState::class,
            'is_team' => 'boolean',
            'last_seen_at' => 'datetime',
        ];
    }
}
