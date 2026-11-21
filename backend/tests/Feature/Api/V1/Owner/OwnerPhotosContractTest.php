<?php

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

/** The draft with two photos of `owner/list.json`. */
const OWNER_PHOTO_DRAFT = '01JF0000000000000000000002';

it('adds a photo last (201), removes one, and orders them; an unknown photo is 404', function (): void {
    $added = $this->post('/api/v1/owner/listings/'.OWNER_PHOTO_DRAFT.'/photos', ['file' => UploadedFile::fake()->image('a.jpg')], ['Accept' => 'application/json'])->assertCreated();
    expect($added->json('data.photos'))->toHaveCount(3);

    $photos = array_column($this->getJson('/api/v1/owner/listings/'.OWNER_PHOTO_DRAFT)->json('data.photos'), 'id');
    $this->deleteJson('/api/v1/owner/listings/'.OWNER_PHOTO_DRAFT.'/photos/'.$photos[0])->assertOk()->assertJsonCount(1, 'data.photos');
    $this->deleteJson('/api/v1/owner/listings/'.OWNER_PHOTO_DRAFT.'/photos/01JF0000000000000000009999')->assertNotFound();

    $this->putJson('/api/v1/owner/listings/'.OWNER_PHOTO_DRAFT.'/photos/order', ['ids' => array_reverse($photos)])->assertOk()
        ->assertJsonPath('data.photos.0.id', $photos[1]);
    $this->putJson('/api/v1/owner/listings/'.OWNER_PHOTO_DRAFT.'/photos/order', ['ids' => [$photos[0]]])->assertStatus(422)->assertJsonValidationErrors(['ids']);
    $this->putJson('/api/v1/owner/listings/'.OWNER_PHOTO_DRAFT.'/photos/order', ['ids' => [$photos[0], $photos[0]]])->assertStatus(422);
});

it('needs the file, refuses one more than the limit and a locked listing', function (): void {
    $this->post('/api/v1/owner/listings/'.OWNER_PHOTO_DRAFT.'/photos', [], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors(['file']);
    config(['owner.limits.photos' => 2]);
    $this->post('/api/v1/owner/listings/'.OWNER_PHOTO_DRAFT.'/photos', ['file' => UploadedFile::fake()->image('a.jpg')], ['Accept' => 'application/json'])
        ->assertStatus(409)->assertJsonPath('code', 'owner_photo_limit');
    $this->post('/api/v1/owner/listings/'.OWNER_PHOTO_DRAFT.'/photos', ['file' => UploadedFile::fake()->image('a.jpg')], ['Accept' => 'application/json', 'X-Stub-Scenario' => 'listing_locked'])
        ->assertStatus(409)->assertJsonPath('code', 'owner_listing_locked');
});
