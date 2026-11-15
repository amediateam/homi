<?php

namespace App\Enums;

/**
 * What `POST /radars` or `PUT /radars/{id}` did (WP-13): a new radar, an active radar with the same filters already
 * existed (nothing written; the client shows "already on"), a paused one was switched on, or the filters changed.
 */
enum RadarMutationKind: string
{
    case Created = 'created';
    case Existing = 'existing';
    case Reactivated = 'reactivated';
    case Updated = 'updated';
}
