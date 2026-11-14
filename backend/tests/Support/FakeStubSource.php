<?php

namespace Tests\Support;

use App\Services\Sources\SourceContext;
use App\Services\Sources\Stub\FixtureStore;

/**
 * The stub driver of the test capability, written the way the contract packages write theirs: it answers from the
 * fixture store (`tests/Support/fixtures` while the test capability is installed) and names its scenarios.
 */
final class FakeStubSource implements FakeCapability
{
    public function __construct(private readonly FixtureStore $fixtures) {}

    public function answer(SourceContext $context): array
    {
        return [...$this->fixtures->pick($context, 'fake/default', ['empty' => 'fake/empty']), 'locale' => $context->locale];
    }
}
