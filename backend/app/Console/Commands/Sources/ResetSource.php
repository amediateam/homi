<?php

namespace App\Console\Commands\Sources;

use App\Services\Sources\SourceConfig;
use App\Services\Sources\SourceRule;
use App\Services\Sources\SourceRuleStore;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;

#[Signature('sources:reset
    {feature : A source feature, e.g. source.listings.feed}
    {--share : Remove the share}
    {--user=* : Remove these user ids}
    {--all : Empty the rule: the configured default applies again}
    {--by= : Who makes the change (required)}
    {--reason= : Why (required)}')]
#[Description('Remove a part of the rule of a source feature; without options, the driver for everyone')]
class ResetSource extends SourceRuleCommand
{
    public function handle(SourceConfig $config, SourceRuleStore $store): int
    {
        $feature = $this->feature($config);
        $audit = $this->audit();
        $userIds = $this->userIds();

        if ($feature === null || $audit === null || $userIds === null) {
            return self::FAILURE;
        }

        $all = (bool) $this->option('all');
        $share = (bool) $this->option('share');

        $change = $store->change($feature, function (SourceRule $rule) use ($all, $share, $userIds): SourceRule {
            if ($all) {
                return new SourceRule;
            }

            if ($share) {
                $rule = $rule->withShare(null);
            }

            if ($userIds !== []) {
                $rule = $rule->withoutUsers($userIds);
            }

            return ! $share && $userIds === [] ? $rule->withEveryone(null) : $rule;
        }, ...$audit);

        $this->report($change);

        return self::SUCCESS;
    }
}
