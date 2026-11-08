<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Raw payloads exactly as accepted (`jsonb` + schema_version), stored before any
     * normalisation so re-processing never needs the collector again (ADR-0009 §3).
     */
    public function up(): void
    {
        Schema::create('intake_events', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignId('source_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('source_listing_id')->constrained()->cascadeOnDelete();
            $table->foreignId('intake_request_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event_type', 32);
            $table->unsignedSmallInteger('schema_version');
            $table->unsignedBigInteger('source_version')->nullable();
            $table->jsonb('payload');
            $table->string('status', 16)->default('received');
            $table->text('error')->nullable();
            $table->timestampTz('received_at');
            $table->timestampTz('processed_at')->nullable();

            $table->index(['source_listing_id', 'received_at']);
            $table->index(['status', 'received_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('intake_events');
    }
};
