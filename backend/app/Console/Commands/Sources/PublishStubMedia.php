<?php

namespace App\Console\Commands\Sources;

use App\Services\Sources\Stub\StubListingSource;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;

/**
 * Publishes the photos of the stub catalogue (WP-10, WP-12): for every photo address `…/stub/<number>/<n>.jpg?…` of
 * `listings/catalog.json` it writes `stub/<number>/<n>.jpg` and the small variant `stub/<number>/<n>.s.jpg` on the
 * public media disk, from the six generated placeholders `placeholder-<k>.jpg` and `placeholder-<k>.s.jpg` (no real
 * photographs). Running it again rewrites the same files. The production track runs it once per environment.
 */
#[Signature('sources:publish-stub-media
    {--from= : Directory with placeholder-1.jpg … placeholder-6.jpg and their .s.jpg variants (default: resources/fixtures/media)}')]
#[Description('Write the placeholder photos of the stub listing catalogue to the public media disk under stub/')]
class PublishStubMedia extends Command
{
    private const int PLACEHOLDERS = 6;

    public function handle(StubListingSource $listings): int
    {
        $from = (string) ($this->option('from') ?: resource_path('fixtures/media'));
        $images = [];

        foreach (range(1, self::PLACEHOLDERS) as $k) {
            foreach (["placeholder-{$k}.jpg", "placeholder-{$k}.s.jpg"] as $name) {
                if (! is_file("{$from}/{$name}")) {
                    $this->components->error("Missing {$from}/{$name}.");

                    return self::FAILURE;
                }

                $images[$name] = (string) file_get_contents("{$from}/{$name}");
            }
        }

        $disk = Storage::disk(Config::string('media.disks.public'));
        $written = 0;

        foreach ($this->photoPaths($listings) as [$number, $n]) {
            $k = ($number + $n - 1) % self::PLACEHOLDERS + 1;
            $disk->put("stub/{$number}/{$n}.jpg", $images["placeholder-{$k}.jpg"]);
            $disk->put("stub/{$number}/{$n}.s.jpg", $images["placeholder-{$k}.s.jpg"]);
            $written += 2;
        }

        $this->components->info("{$written} stub images published under stub/.");

        return self::SUCCESS;
    }

    /**
     * Every distinct `[number, n]` of the catalogue's photo addresses.
     *
     * @return list<array{0: int, 1: int}>
     */
    private function photoPaths(StubListingSource $listings): array
    {
        $paths = [];

        foreach ($listings->entries() as $entry) {
            array_walk_recursive($entry, function (mixed $value) use (&$paths): void {
                if (is_string($value) && preg_match('#/stub/(\d+)/(\d+)\.jpg(?:\?|$)#', $value, $match) === 1) {
                    $paths["{$match[1]}/{$match[2]}"] = [(int) $match[1], (int) $match[2]];
                }
            });
        }

        return array_values($paths);
    }
}
