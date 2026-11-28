<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HOMI's radars (WP-45; tasks `KV-BE-100`, `KV-DB-009`): a user's saved searches, written only by
 * `App\Services\Radar\RadarService`, gone with the user. `filters` is the 25-key object of WP-12 as received
 * (`posted_days` kept, DEV-005; prices in USD, DEV-006); `filters_hash` its canonical hash without `posted_days`, so
 * the unique (`user_id`, `filters_hash`) is the last guard against two radars of one search (BR-APP-012). `city` and
 * `deal` repeat the filters for the matcher of WP-46, which reads (`active`, `filters_hash`); the list reads
 * (`user_id`, `created_at`). `entry` and `relax_code` are statistics only (BR-API-086, LB-API-035); `hidden_count`
 * counts the listings the radar's hide rules held back since they were last cleared.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radars', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->boolean('active')->default(true);
            $table->string('mode', 8)->default('instant');
            $table->json('filters');
            $table->char('filters_hash', 64);
            $table->string('city', 64);
            $table->string('deal', 16);
            $table->string('entry', 16)->nullable();
            $table->string('relax_code', 32)->nullable();
            $table->integer('hidden_count')->default(0);
            $table->timestampTz('paused_at')->nullable();
            $table->timestampsTz();
            $table->unique(['user_id', 'filters_hash']);
            $table->index(['active', 'filters_hash']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radars');
    }
};
