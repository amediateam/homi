<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a listing number points (WP-42, "`listing_refs` and author keys"; `25` §5, Q-API-063): one row per number,
 * written by `App\Services\Listings\ListingRefs` when a full card comes from legacy (a cache miss), so the personal
 * tables of WP-44 can store a number with its channel and post, and the overlay can find the listings of a blocked or
 * realtor-marked author. `author_key` is pseudonymous (`phone:` + a keyed hash, `source:<channel>` or the operator's
 * `legacy:<key>`), never a phone number; `merged_into` is the number legacy answered for this one; `gone_at` is set
 * when legacy answered `404` for a number HOMI knew.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('listing_refs', function (Blueprint $table): void {
            $table->unsignedBigInteger('listing_number')->primary();
            $table->string('source_channel', 64)->nullable();
            $table->unsignedBigInteger('source_post_id')->nullable();
            $table->string('author_key', 96)->nullable()->index();
            $table->string('author_kind', 8)->nullable();
            $table->string('district_code', 64)->nullable();
            $table->unsignedBigInteger('merged_into')->nullable();
            $table->timestampTz('first_seen_at')->nullable();
            $table->timestampTz('last_seen_at')->nullable();
            $table->timestampTz('gone_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('listing_refs');
    }
};
