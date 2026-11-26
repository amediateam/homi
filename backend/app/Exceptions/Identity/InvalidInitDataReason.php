<?php

namespace App\Exceptions\Identity;

/**
 * Why the verifier refused a Telegram launch value (WP-40). Internal: it goes into the sign-in's log line, never into
 * the error body, which stays `401 invalid_init_data` for every reason.
 */
enum InvalidInitDataReason: string
{
    case TooLarge = 'too_large';
    case DuplicateKey = 'duplicate_key';
    case MissingHash = 'missing_hash';
    case BadSignature = 'bad_signature';
    case BadUser = 'bad_user';
    case BadAuthDate = 'bad_auth_date';
    case FutureAuthDate = 'future_auth_date';
}
