<?php

namespace Tests\Support;

use App\Services\Sources\SourceContext;

/** The "legacy" double of the test capability; it opens no connection. */
final class FakeLegacySource implements FakeCapability
{
    public function answer(SourceContext $context): array
    {
        return ['from' => 'legacy', 'locale' => $context->locale];
    }
}
