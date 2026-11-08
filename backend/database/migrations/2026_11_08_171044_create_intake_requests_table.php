<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Idempotency ledger: the stored response of every accepted intake request, keyed by
     * (source, Idempotency-Key). A replay returns the original body with status 200 (ADR-0009 §3).
     */
    public function up(): void
    {
        Schema::create('intake_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('source_id')->constrained()->cascadeOnDelete();
            $table->string('idempotency_key', 128);
            $table->unsignedSmallInteger('status_code');
            $table->jsonb('response');
            $table->timestampsTz();

            $table->unique(['source_id', 'idempotency_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('intake_requests');
    }
};
