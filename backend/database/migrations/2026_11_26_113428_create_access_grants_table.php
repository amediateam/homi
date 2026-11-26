<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A user's standing at the access gate (WP-40): at most one row per user, gone with the user. `state` is `admitted`
 * (the user holds a seat: written by the gate's seat admission in `open` mode with `ACCESS_MAX_SEATS`, by an invite in
 * WP-52) or `blocked` by an operator (`access:block`). `admitted_via` (`open`, `invite`, `owner`, `operator`) says how
 * the user was admitted; it is null on a grant blocked before any admission, which `access:unblock` deletes.
 * `flagged_at` and `flag_reason` mark an account for an operator to look at; they decide nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('access_grants', function (Blueprint $table): void {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->string('state', 16)->index();
            $table->string('admitted_via', 16)->nullable();
            $table->timestampTz('flagged_at')->nullable();
            $table->string('flag_reason', 255)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('access_grants');
    }
};
