<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per external listing per source — the stable HOMI id a collector gets back
     * (ADR-0009: `(source_code, external_id)` is unique). `listing_id` links to the Listings
     * module once it exists; no foreign key yet.
     */
    public function up(): void
    {
        Schema::create('source_listings', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignId('source_id')->constrained()->cascadeOnDelete();
            $table->string('external_id', 64);
            $table->unsignedBigInteger('source_version')->nullable();
            $table->string('status', 16)->default('active');
            $table->timestampTz('first_seen_at');
            $table->timestampTz('last_event_at');
            $table->ulid('listing_id')->nullable();
            $table->timestampsTz();

            $table->unique(['source_id', 'external_id']);
            $table->index(['source_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('source_listings');
    }
};
