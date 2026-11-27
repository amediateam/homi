<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The reports of listings (WP-44; task `KV-BE-043`): one weighted vote per user, listing and reason, never sent to
 * legacy (DEC-48). `author_key` is the listing's author key of `listing_refs` when known (an `agent` vote counts per
 * key); `detail` is one of the five `ReportDetail` codes, only with `wrong_data`, and is nulled after 180 days (WP-47);
 * `withdrawn_at` marks a vote taken back, which no longer counts. Gone with the user (WP-47 recounts the marks).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('listing_votes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('listing_number');
            $table->string('source_channel', 64)->nullable();
            $table->unsignedBigInteger('source_post_id')->nullable();
            $table->string('author_key', 96)->nullable();
            $table->string('reason', 16);
            $table->string('detail', 16)->nullable();
            $table->decimal('weight', 4, 2);
            $table->timestampTz('withdrawn_at')->nullable();
            $table->timestampTz('created_at');
            $table->unique(['user_id', 'listing_number', 'reason']);
            $table->index(['listing_number', 'reason']);
            $table->index(['author_key', 'reason']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('listing_votes');
    }
};
