<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Owner\Data\OwnerRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A request as its owner sees it (WP-80); the answer flags are always present (BR-API-180). */
class OwnerRequestResource extends JsonResource
{
    public function __construct(private readonly OwnerRequest $request)
    {
        parent::__construct($request);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->request->id,
            'name' => $this->request->name,
            'who' => $this->request->who,
            'people' => $this->request->people,
            'move_in' => $this->request->moveIn,
            'message' => $this->request->message,
            'status' => $this->request->status,
            'agent_marked' => $this->request->agentMarked,
            'can_reason' => $this->request->canReason,
            'can_undo' => $this->request->canUndo,
            'can_late' => $this->request->canLate,
        ];
    }
}
