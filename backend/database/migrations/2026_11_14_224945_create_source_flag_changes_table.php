<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit log of the source feature rules (WP-10, ADR-0017): who changed which driver, when and why. Additive and
 * empty; rows are written by `php artisan sources:set|reset` and by a listener for changes made around them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('source_flag_changes', function (Blueprint $table) {
            $table->id();
            $table->string('feature', 64);
            $table->json('old_rule')->nullable();
            $table->json('new_rule')->nullable();
            $table->string('actor', 64);
            $table->string('reason', 255)->nullable();
            $table->string('environment', 32);
            $table->timestamp('created_at')->useCurrent();

            $table->index(['feature', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('source_flag_changes');
    }
};
