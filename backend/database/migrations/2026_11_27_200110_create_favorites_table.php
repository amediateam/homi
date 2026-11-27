<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A user's favourites (WP-44; task `KV-BE-038`): one row per user and listing, written by
 * `App\Services\Personal\FavoriteService` with an explicit target state, so a repeat changes nothing; gone with the
 * user. The channel and post travel with the number when known (`25` §5); `ResolveListingRef` back-fills them. The
 * list pages by row id, newest first (DEC-53).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('favorites', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('listing_number');
            $table->string('source_channel', 64)->nullable();
            $table->unsignedBigInteger('source_post_id')->nullable();
            $table->timestampTz('created_at');
            $table->unique(['user_id', 'listing_number']);
            $table->index(['user_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('favorites');
    }
};
