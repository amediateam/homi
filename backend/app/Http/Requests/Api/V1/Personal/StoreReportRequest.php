<?php

namespace App\Http\Requests\Api\V1\Personal;

use App\Enums\Personal\ReportDetail;
use App\Enums\Personal\ReportReason;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `POST /listings/{number}/reports` (WP-13, API-016): `reason`, and `detail` only with `wrong_data` (the third step
 * of the report sheet, BR-API-101). `wrong_data` without a detail is accepted for older bundles; a null detail counts
 * as absent.
 */
class StoreReportRequest extends FormRequest
{
    public const array REASONS = ['rented', 'agent', 'wrong_data', 'fraud'];

    public const array DETAILS = ['price', 'rooms', 'place', 'photos', 'other'];

    /** Reasons that hide the listing for the reporter. */
    public const array HIDING = ['rented', 'fraud'];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', Rule::in(self::REASONS)],
            'detail' => ['nullable', 'string', Rule::in(self::DETAILS), 'prohibited_unless:reason,wrong_data'],
        ];
    }

    public function hides(): bool
    {
        return in_array($this->string('reason')->toString(), self::HIDING, true);
    }

    /** Whether the report says that the author is a realtor. */
    public function namesAgent(): bool
    {
        return $this->string('reason')->toString() === 'agent';
    }

    /** The validated reason (WP-44). */
    public function reason(): ReportReason
    {
        return ReportReason::from($this->string('reason')->toString());
    }

    /** The validated detail of a `wrong_data` report, `null` when it has none (WP-44). */
    public function detail(): ?ReportDetail
    {
        return $this->enum('detail', ReportDetail::class);
    }
}
