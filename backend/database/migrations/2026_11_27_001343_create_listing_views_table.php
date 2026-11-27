<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The view history of a user (WP-42, "View history"; task `KV-BE-039`): one row per user and listing, written by
 * `App\Services\Listings\ViewRecorder` after a full card read (never a preview), gone with the user. A second read
 * adds to `views` and moves `last_viewed_at`, so the history lists a listing once, newest read first. The channel and
 * post travel with the number (`25` §5, Q-API-063).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('listing_views', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('listing_number');
            $table->string('source_channel', 64)->nullable();
            $table->unsignedBigInteger('source_post_id')->nullable();
            $table->timestampTz('first_viewed_at');
            $table->timestampTz('last_viewed_at');
            $table->integer('views')->default(1);
            $table->unique(['user_id', 'listing_number']);
            $table->index(['user_id', 'last_viewed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('listing_views');
    }
};
