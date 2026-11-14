<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Who holds a media file (WP-00, KI-25): one row per owner of a content-addressed
     * `media_files` row. The row and its objects live while at least one reference exists.
     *
     * The backfill gives every existing row with an uploader that user as its owner. Only users
     * can be uploaders here: before this change a source token failed with a 500 in the upload
     * rate limiter, before any row was written.
     */
    public function up(): void
    {
        Schema::create('media_file_references', function (Blueprint $table): void {
            $table->id();
            $table->foreignUlid('media_file_id')->constrained('media_files')->cascadeOnDelete();
            $table->string('owner_type', 16);
            $table->string('owner_id', 32);
            $table->timestampTz('created_at')->useCurrent();

            $table->unique(['media_file_id', 'owner_type', 'owner_id']);
            $table->index(['owner_type', 'owner_id']);
        });

        DB::table('media_file_references')->insertUsing(
            ['media_file_id', 'owner_type', 'owner_id', 'created_at'],
            DB::table('media_files')
                ->selectRaw("id, 'user', CAST(uploaded_by AS VARCHAR(32)), COALESCE(created_at, CURRENT_TIMESTAMP)")
                ->whereNotNull('uploaded_by'),
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('media_file_references');
    }
};
