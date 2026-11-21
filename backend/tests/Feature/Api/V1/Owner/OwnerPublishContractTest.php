<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

/** The complete draft without a phone of `owner/list.json`. */
const OWNER_COMPLETE = '01JF0000000000000000000004';

it('sets the contact mode; the phone request answers the listing; the show scenarios of the phone', function (): void {
    $this->putJson('/api/v1/owner/listings/'.OWNER_COMPLETE.'/contact-mode', ['mode' => 'phone'])->assertOk()->assertJsonPath('data.contact_mode', 'phone');
    $this->putJson('/api/v1/owner/listings/'.OWNER_COMPLETE.'/contact-mode', ['mode' => 'open'])->assertStatus(422)->assertJsonValidationErrors(['mode']);
    $this->postJson('/api/v1/owner/listings/'.OWNER_COMPLETE.'/phone-request')->assertOk()->assertJsonPath('data.phone_set', false);
    $this->getJson('/api/v1/owner/listings/'.OWNER_COMPLETE, ['X-Stub-Scenario' => 'phone_set'])->assertOk()->assertJsonPath('data.phone_set', true)->assertJsonPath('data.phone_display', '+998 00 000-00-81');
    $this->getJson('/api/v1/owner/listings/'.OWNER_COMPLETE, ['X-Stub-Scenario' => 'phone_not_uz'])->assertJsonPath('data.phone_error', 'not_uz');
    $this->getJson('/api/v1/owner/listings/'.OWNER_COMPLETE, ['X-Stub-Scenario' => 'phone_not_own'])->assertJsonPath('data.phone_error', 'not_own');
});

it('publish: without a number 409 owner_phone_required; with one active and numbered; the missing parts named', function (): void {
    $this->postJson('/api/v1/owner/listings/'.OWNER_COMPLETE.'/publish')->assertStatus(409)->assertJsonPath('code', 'owner_phone_required');
    $this->postJson('/api/v1/owner/listings/01JF0000000000000000000002/publish')->assertStatus(422)->assertJsonValidationErrors(['place']);
    $this->postJson('/api/v1/owner/listings/'.OWNER_COMPLETE.'/publish', [], ['X-Stub-Scenario' => 'publish_missing'])->assertStatus(422)->assertJsonValidationErrors(['place', 'photos']);
    $this->postJson('/api/v1/owner/listings/01JF0000000000000000000003/publish')->assertOk()->assertJsonPath('data.status', 'active')->assertJsonPath('data.number', 10000008);
});

it('publish refusals and the realtor hold by scenario', function (): void {
    $this->postJson('/api/v1/owner/listings/'.OWNER_COMPLETE.'/publish', [], ['X-Stub-Scenario' => 'owner_limit'])->assertStatus(409)->assertJsonPath('code', 'owner_limit');
    $this->postJson('/api/v1/owner/listings/'.OWNER_COMPLETE.'/publish', [], ['X-Stub-Scenario' => 'rejected_denied'])->assertStatus(409)->assertJsonPath('code', 'owner_rejected')->assertJsonPath('reason', 'denied');
    $this->postJson('/api/v1/owner/listings/'.OWNER_COMPLETE.'/publish', [], ['X-Stub-Scenario' => 'rejected_limit'])->assertStatus(409)->assertJsonPath('reason', 'limit');
    $this->postJson('/api/v1/owner/listings/'.OWNER_COMPLETE.'/publish', [], ['X-Stub-Scenario' => 'listing_locked'])->assertStatus(409)->assertJsonPath('code', 'owner_listing_locked');
    $this->postJson('/api/v1/owner/listings/'.OWNER_COMPLETE.'/publish', [], ['X-Stub-Scenario' => 'held_check'])->assertOk()
        ->assertJsonPath('data.status', 'paused')->assertJsonPath('data.held', true)->assertJsonPath('data.hold_reason', 'check_agent')
        ->assertJsonPath('data.published_at', null)->assertJsonPath('data.number', 10000013);
    $this->getJson('/api/v1/owner/listings/'.OWNER_COMPLETE, ['X-Stub-Scenario' => 'rejected_denied'])->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.reject_reason', 'denied');
});
