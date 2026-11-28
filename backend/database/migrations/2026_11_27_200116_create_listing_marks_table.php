<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HOMI's marks of a listing for everybody (WP-44): `rented_at` is set when the weighted `rented` votes cross the
 * threshold, and cleared when a recount falls below it. A row without a time marks nothing (a recount may hold the row
 * of a listing before it marks). WP-57 adds `taken_down_at` in its own migration. No user link.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('listing_marks', function (Blueprint $table): void {
            $table->unsignedBigInteger('listing_number')->primary();
            $table->timestampTz('rented_at')->nullable();
            $table->timestampTz('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('listing_marks');
    }
};
