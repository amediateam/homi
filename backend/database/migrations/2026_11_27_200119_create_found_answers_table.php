<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The answers to «Нашли жильё?» (WP-44; task `KV-BE-044`): every tap is a row (statistics, not idempotent by design);
 * `where` fills the user's latest `elsewhere` row without one, else stands in a row of its own. Closed sets of
 * values, no free text; gone with the user.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('found_answers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('answer', 16)->nullable();
            $table->string('trigger', 16)->nullable();
            $table->string('where', 16)->nullable();
            $table->timestampTz('created_at');
            $table->index(['user_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('found_answers');
    }
};
