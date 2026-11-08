<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Content-addressed originals: one row per (disk, sha256); variants are derived into
     * derived/{sha256}/{width}.webp by GenerateImageVariantsJob (master prompt §7.4).
     */
    public function up(): void
    {
        Schema::create('media_files', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('disk', 32);
            $table->string('key', 255);
            $table->char('sha256', 64);
            $table->string('mime', 64);
            $table->string('ext', 8);
            $table->unsignedBigInteger('bytes');
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->string('visibility', 16);
            $table->string('status', 16)->default('pending');
            $table->jsonb('variants')->nullable();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            $table->unique(['disk', 'sha256']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_files');
    }
};
