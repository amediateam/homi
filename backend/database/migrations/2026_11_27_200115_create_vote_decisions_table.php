<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The audit of HOMI's vote detectors (WP-44; SEC-REQ-045): one row each time a recount crosses a threshold, up
 * (`marked`) or down (`unmarked`), with its inputs — the subject (a listing number or an author key), the reason, the
 * distinct voters, the weight sum and the threshold. No user link: voters are counted, never named.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vote_decisions', function (Blueprint $table): void {
            $table->id();
            $table->string('subject_type', 16);
            $table->string('subject', 96);
            $table->string('reason', 16);
            $table->integer('voters');
            $table->decimal('weight_sum', 6, 2);
            $table->decimal('threshold', 6, 2);
            $table->string('outcome', 16);
            $table->timestampTz('created_at');
            $table->index(['subject_type', 'subject']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vote_decisions');
    }
};
