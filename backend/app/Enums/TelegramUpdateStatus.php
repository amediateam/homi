<?php

namespace App\Enums;

enum TelegramUpdateStatus: string
{
    case Received = 'received';
    case Processing = 'processing';
    case Done = 'done';
    case Failed = 'failed';
}
