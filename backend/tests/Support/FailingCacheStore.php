<?php

namespace Tests\Support;

use Illuminate\Cache\ArrayStore;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

/**
 * The `array` store with every read, write and lock of keys under one prefix failing, as a cache store that is down
 * would fail (WP-43): the rest of the application (the access gate, the limiters) keeps its cache, so a test reaches
 * the code it means to break. `install()` makes it the default store; the limiters were bound to the `array` store at
 * boot and keep it.
 */
final class FailingCacheStore extends ArrayStore
{
    public function __construct(private readonly string $failing)
    {
        parent::__construct();
    }

    /** Makes a store whose keys under `$failing` fail the default cache store. */
    public static function install(string $failing): void
    {
        // Built out here: the creator is bound to the cache manager, where `self` would name the manager.
        $store = new FailingCacheStore($failing);
        Cache::extend('failing', fn (): Repository => Cache::repository($store));
        config(['cache.stores.failing' => ['driver' => 'failing'], 'cache.default' => 'failing']);
    }

    public function get($key)
    {
        $this->refuse($key);

        return parent::get($key);
    }

    public function put($key, $value, $seconds)
    {
        $this->refuse($key);

        return parent::put($key, $value, $seconds);
    }

    public function lock($name, $seconds = 0, $owner = null)
    {
        $this->refuse($name);

        return parent::lock($name, $seconds, $owner);
    }

    private function refuse(string $key): void
    {
        if (str_starts_with($key, $this->failing)) {
            throw new RuntimeException('The cache store is down.');
        }
    }
}
