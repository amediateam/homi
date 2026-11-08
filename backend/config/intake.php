<?php

/*
|--------------------------------------------------------------------------
| Intake module (ADR-0009): collectors push listings into HOMI
|--------------------------------------------------------------------------
*/

return [

    // Current payload schema version accepted by /api/v1/intake/*; see docs/api/intake.md.
    'schema_version' => 1,

    'batch_max' => 100,

    // Sanctum ability granted to collector tokens (intake:token command).
    'ability' => 'intake:write',

    // Lifecycle events a collector may send for an already known listing.
    'event_types' => ['created', 'updated', 'withdrawn', 'duplicate_changed', 'media_added'],

    // Accepted enum values for classification fields (payload v1).
    'deal_types' => ['sale', 'rent', 'buy', 'rent_wanted'],
    'property_types' => ['apartment', 'house', 'land', 'commercial', 'room'],
    'currencies' => ['UZS', 'USD', 'EUR'],
    'price_types' => ['fixed', 'from', 'range', 'negotiable_no_price', 'on_request'],
    'contact_roles' => ['owner', 'agent', 'agency', 'unknown'],
    'media_types' => ['photo', 'video'],

    // Normalisation runs on this queue once the Listings module exists (Phase 3 stores raw events only).
    'queue' => 'ingest',

];
