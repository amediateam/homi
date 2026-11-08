<?php

namespace App\Enums;

enum IntakeEventType: string
{
    case Created = 'created';
    case Updated = 'updated';
    case Withdrawn = 'withdrawn';
    case DuplicateChanged = 'duplicate_changed';
    case MediaAdded = 'media_added';

    /**
     * Event types a collector may send explicitly through the events endpoint.
     *
     * @return list<string>
     */
    public static function explicitValues(): array
    {
        return [self::Updated->value, self::Withdrawn->value, self::DuplicateChanged->value, self::MediaAdded->value];
    }
}
