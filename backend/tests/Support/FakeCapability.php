<?php

namespace Tests\Support;

use App\Services\Sources\SourceContext;

/**
 * The contract of a capability that exists only in tests (WP-10). It proves resolution end to end before any real
 * contract has methods; `FakeCapabilityController::install()` wires it.
 */
interface FakeCapability
{
    /** @return array<string, mixed> */
    public function answer(SourceContext $context): array;
}
