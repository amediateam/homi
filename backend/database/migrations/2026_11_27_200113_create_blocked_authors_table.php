<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The authors a user blocked (WP-44; task `KV-BE-041`): one entry per user and author key, addressed by its ULID
 * (`DELETE /hidden/authors/{id}`). `author_key` is the pseudonymous key of `listing_refs` (WP-42: `phone:` + a keyed
 * hash, `source:<channel>` or `legacy:<key>`), never a phone number; `label` is plain text masked at block time (a
 * phone's last two digits or `@channel`). The listing columns name the listing the block was made from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blocked_authors', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('author_key', 96);
            $table->string('kind', 8);
            $table->string('label', 64);
            $table->unsignedBigInteger('listing_number');
            $table->string('source_channel', 64)->nullable();
            $table->unsignedBigInteger('source_post_id')->nullable();
            $table->timestampTz('created_at');
            $table->unique(['user_id', 'author_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blocked_authors');
    }
};
