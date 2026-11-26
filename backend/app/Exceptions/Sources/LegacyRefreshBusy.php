<?php

namespace App\Exceptions\Sources;

/**
 * Another process is making the first refresh of a legacy directory and there is no last good copy yet (WP-41): the
 * caller answers `503 source_unavailable` at once instead of calling legacy too. Contention, not a failure of legacy,
 * so it never marks a directory down.
 */
final class LegacyRefreshBusy extends SourceUnavailable {}
