<?php

namespace App\Enums\Personal;

/**
 * Why a listing is in a user's `hidden_listings` (WP-44): hidden by hand, or by the user's own `rented` or `fraud`
 * report (`VoteService`). A row keeps its first reason; unhide removes it whatever the reason, and never a vote.
 */
enum HiddenReason: string
{
    case Manual = 'manual';
    case ReportRented = 'report_rented';
    case ReportFraud = 'report_fraud';
}
