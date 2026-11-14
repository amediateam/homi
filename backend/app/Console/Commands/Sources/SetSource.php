<?php

namespace App\Console\Commands\Sources;

use App\Enums\SourceDriver;
use App\Services\Sources\SourceConfig;
use App\Services\Sources\SourceManager;
use App\Services\Sources\SourceRule;
use App\Services\Sources\SourceRuleStore;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;

#[Signature('sources:set
    {feature : A source feature, e.g. source.listings.feed}
    {driver : stub, legacy or native}
    {--share= : Give this percentage of users (0-100) the driver, instead of everyone}
    {--user=* : Give these user ids the driver, instead of everyone}
    {--by= : Who makes the change (required)}
    {--reason= : Why (required)}')]
#[Description('Set the driver of a source feature for everyone, a share of users or named users; takes effect on the next request')]
class SetSource extends SourceRuleCommand
{
    public function handle(SourceConfig $config, SourceManager $manager, SourceRuleStore $store): int
    {
        $feature = $this->feature($config);
        $audit = $this->audit();
        $userIds = $this->userIds();

        if ($feature === null || $audit === null || $userIds === null) {
            return self::FAILURE;
        }

        $driver = SourceDriver::tryFrom((string) $this->argument('driver'));
        $bound = $manager->boundDrivers($feature);

        if ($driver === null) {
            $this->components->error('The driver is one of: stub, legacy, native.');

            return self::FAILURE;
        }

        if (! in_array($driver->value, $bound, true)) {
            $this->components->error("No \"{$driver->value}\" driver is bound for {$feature}. Bound: ".($bound === [] ? 'none' : implode(', ', $bound)).'.');

            return self::FAILURE;
        }

        if ($driver === SourceDriver::Stub && ! $config->allowStub()) {
            $this->components->error('Stubs are off in this environment (SOURCES_ALLOW_STUB=false).');

            return self::FAILURE;
        }

        $share = $this->option('share');

        if ($share !== null && (! ctype_digit($share) || (int) $share > 100)) {
            $this->components->error('--share is a percentage from 0 to 100.');

            return self::FAILURE;
        }

        $change = $store->change($feature, function (SourceRule $rule) use ($driver, $share, $userIds): SourceRule {
            if ($share !== null) {
                $rule = $rule->withShare($driver->value, (int) $share);
            }

            if ($userIds !== []) {
                $rule = $rule->withUsers($userIds, $driver->value);
            }

            return $share === null && $userIds === [] ? $rule->withEveryone($driver->value) : $rule;
        }, ...$audit);

        $this->report($change);

        return self::SUCCESS;
    }
}
