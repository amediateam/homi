<?php

namespace App\Console\Commands\Sources;

use App\Services\Sources\SourceConfig;
use App\Services\Sources\SourceManager;
use App\Services\Sources\SourceRule;
use App\Services\Sources\SourceRuleStore;
use App\Services\Sources\SourceSelector;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use InvalidArgumentException;

#[Signature('sources:check')]
#[Description('Fail when a source feature can resolve to a driver that is not bound or not allowed here (for dev-check and deploy smoke tests)')]
class CheckSources extends Command
{
    public function handle(SourceConfig $config, SourceSelector $selector, SourceManager $manager, SourceRuleStore $store): int
    {
        $problems = [];

        foreach ($config->features() as $feature) {
            $bound = $manager->boundDrivers($feature);

            try {
                $rule = SourceRule::fromStored($store->stored($feature));
            } catch (InvalidArgumentException $e) {
                $problems[] = [$feature, 'stored rule', "malformed: {$e->getMessage()}"];
                $rule = new SourceRule;
            }

            $names = array_filter(['default' => $selector->defaultFor($feature), 'everyone' => $rule->everyone, 'share' => $rule->shareDriver])
                + array_combine(array_map(fn (int $id): string => "user {$id}", array_keys($rule->users)), $rule->users);

            if (! array_key_exists('default', $names)) {
                $problems[] = [$feature, 'default', 'no default for this environment'];
            }

            foreach ($names as $part => $name) {
                $driver = $selector->usable($name);

                if ($driver === null) {
                    $problems[] = [$feature, $part, "\"{$name}\" is unknown or not allowed here"];
                } elseif (! in_array($driver->value, $bound, true)) {
                    $problems[] = [$feature, $part, "\"{$name}\" is not bound"];
                }
            }
        }

        if ($problems !== []) {
            $this->table(['Feature', 'Part', 'Problem'], $problems);

            return self::FAILURE;
        }

        $this->components->info(count($config->features()).' source features resolve to bound drivers.');

        return self::SUCCESS;
    }
}
