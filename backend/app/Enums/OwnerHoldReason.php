<?php

namespace App\Enums;

/**
 * Why a listing is on hold (WP-80): the realtor check at publish, a vote threshold, or an operator. The client shows every
 * hold as «На проверке».
 */
enum OwnerHoldReason: string
{
    case CheckAgent = 'check_agent';
    case VotesAgent = 'votes_agent';
    case VotesFraud = 'votes_fraud';
    case VotesRented = 'votes_rented';
    case Moderator = 'moderator';
}
