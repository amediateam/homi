<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The hide rules of a radar (WP-45; task `KV-BE-106`, DEV-034: per radar): «Скрыть похожие» of the bot keeps a
 * channel, a district code or an author key out of this radar's deliveries; `PATCH {"unhide": true}` deletes them all
 * (DEV-033). Gone with the radar. `target` of an `author` rule is the pseudonymous key of `listing_refs` (WP-42),
 * never a phone number. One row per radar, kind and target, so an add is idempotent.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_hide_rules', function (Blueprint $table): void {
            $table->id();
            $table->foreignUlid('radar_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 8);
            $table->string('target', 96);
            $table->timestampTz('created_at');
            $table->unique(['radar_id', 'kind', 'target']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_hide_rules');
    }
};
