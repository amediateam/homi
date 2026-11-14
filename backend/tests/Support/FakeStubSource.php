<?php

namespace Tests\Support;

use App\Services\Sources\SourceContext;

/** The stub driver of the test capability. */
final class FakeStubSource implements FakeCapability
{
    public function answer(SourceContext $context): array
    {
        return ['from' => 'stub', 'locale' => $context->locale];
    }
}
