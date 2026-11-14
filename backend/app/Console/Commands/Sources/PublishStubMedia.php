<?php

namespace App\Console\Commands\Sources;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Finder\SplFileInfo;

#[Signature('sources:publish-stub-media
    {--from= : Directory to copy from (default: resources/fixtures/media)}')]
#[Description('Copy the placeholder images of the stub fixtures to the public media disk under stub/, so fixture photo addresses resolve under MEDIA_PUBLIC_URL')]
class PublishStubMedia extends Command
{
    public function handle(): int
    {
        $from = (string) ($this->option('from') ?: resource_path('fixtures/media'));

        if (! is_dir($from)) {
            $this->components->error("No such directory: {$from}.");

            return self::FAILURE;
        }

        $disk = Storage::disk((string) config('media.disks.public'));
        $files = array_filter(File::allFiles($from), fn (SplFileInfo $file): bool => $file->getFilename() !== '.gitkeep');

        foreach ($files as $file) {
            $disk->put('stub/'.str_replace('\\', '/', $file->getRelativePathname()), $file->getContents());
        }

        $this->components->info(count($files).' stub images published under stub/.');

        return self::SUCCESS;
    }
}
