<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The listings a user hid (WP-44; task `KV-BE-040`): one row per user and listing, by hand (`manual`) or by the
 * user's own `rented` or `fraud` report (`report_rented`, `report_fraud`); the first reason stays. Only this user's
 * feed and map leave them out; gone with the user. Radar hide rules are not here (WP-45).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hidden_listings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('listing_number');
            $table->string('source_channel', 64)->nullable();
            $table->unsignedBigInteger('source_post_id')->nullable();
            $table->string('reason', 16);
            $table->timestampTz('created_at');
            $table->unique(['user_id', 'listing_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hidden_listings');
    }
};
