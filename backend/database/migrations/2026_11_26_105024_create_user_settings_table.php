<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A user's settings (WP-40, `25` §5): one row per user, created with the defaults of `config/settings.php` on the
 * first contact (`SettingsService::createDefaults()`), and gone with the user. `locale_chosen_at` and
 * `city_chosen_at` record that the user picked a language or a city (the first-launch pickers read them as
 * `locale_chosen` and `city_chosen`). Quiet hours are two Asia/Tashkent wall-clock times, both null when off;
 * `digest_hours` is a JSON list of sorted, unique whole hours.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_settings', function (Blueprint $table): void {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->string('locale', 2);
            $table->timestampTz('locale_chosen_at')->nullable();
            $table->string('currency', 3);
            $table->string('theme', 8);
            $table->string('city', 64)->nullable();
            $table->timestampTz('city_chosen_at')->nullable();
            $table->time('quiet_start')->nullable();
            $table->time('quiet_end')->nullable();
            $table->json('digest_hours');
            $table->string('card_style', 8)->default('classic');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_settings');
    }
};
