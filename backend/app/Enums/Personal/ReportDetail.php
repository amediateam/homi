<?php

namespace App\Enums\Personal;

/**
 * What is wrong in a `wrong_data` report (WP-13, BR-APP-036; stored by WP-44 for review only, it changes no mark): the
 * five codes of `StoreReportRequest::DETAILS`.
 */
enum ReportDetail: string
{
    case Price = 'price';
    case Rooms = 'rooms';
    case Place = 'place';
    case Photos = 'photos';
    case Other = 'other';
}
