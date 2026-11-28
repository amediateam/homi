<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HOMI's marks of an author for everybody (WP-44): `realtor_marked_at` is set when the weighted `agent` votes of
 * distinct users on the author's key cross the threshold (`source` = `votes`), and cleared when a recount falls below
 * it. A row without a time marks nothing (a recount may hold the row of a key before it marks). The key is the
 * pseudonymous author key of `listing_refs`; a `phone:` key's row expires three years after its last mark (WP-47).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('author_marks', function (Blueprint $table): void {
            $table->string('author_key', 96)->primary();
            $table->timestampTz('realtor_marked_at')->nullable();
            $table->string('source', 16)->nullable();
            $table->timestampTz('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('author_marks');
    }
};
