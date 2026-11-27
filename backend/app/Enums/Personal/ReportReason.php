<?php

namespace App\Enums\Personal;

/**
 * The reason of a report (WP-13, BR-API-101; stored by WP-44): «Уже сдано», «Это риелтор», «Неверные данные» and
 * «Мошенничество». The wire values are `StoreReportRequest::REASONS`.
 */
enum ReportReason: string
{
    case Rented = 'rented';
    case Agent = 'agent';
    case WrongData = 'wrong_data';
    case Fraud = 'fraud';
}
