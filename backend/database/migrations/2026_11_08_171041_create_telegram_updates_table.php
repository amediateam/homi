<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Webhook deduplication ledger (master prompt §8.3/§8.6): one row per (bot_id, update_id),
     * inserted with insertOrIgnore before the job is queued; pruned after telegram.updates_retention_days.
     */
    public function up(): void
    {
        Schema::create('telegram_updates', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('bot_id');
            $table->unsignedBigInteger('update_id');
            $table->jsonb('payload');
            $table->string('status', 16)->default('received');
            $table->text('error')->nullable();
            $table->timestampTz('processed_at')->nullable();
            $table->timestampsTz();

            $table->unique(['bot_id', 'update_id']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('telegram_updates');
    }
};
