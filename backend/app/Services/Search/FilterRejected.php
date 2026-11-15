<?php

namespace App\Services\Search;

use DomainException;

/**
 * A filter value the normaliser cannot accept (WP-12): an unknown enum value or code, a number out of range, a
 * malformed polygon. `$field` is the parameter name; `/api/v1` answers `422 validation_failed` with it in `errors`.
 */
final class FilterRejected extends DomainException
{
    public function __construct(public readonly string $field, string $message)
    {
        parent::__construct($message);
    }
}
