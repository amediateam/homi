<?php

namespace App\Enums;

enum MediaVisibility: string
{
    case Public = 'public';
    case Private = 'private';

    /**
     * Name of the filesystem disk configured for this visibility (config/media.php).
     */
    public function disk(): string
    {
        return (string) config('media.disks.'.$this->value);
    }
}
