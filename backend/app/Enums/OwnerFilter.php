<?php

namespace App\Enums;

/** The `owner` filter (BR-API-035): everything, without explicit realtors, or only explicit owners. */
enum OwnerFilter: string
{
    case Any = 'any';
    case NoAgents = 'no_agents';
    case Owners = 'owners';
}
