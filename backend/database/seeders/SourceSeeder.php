<?php

namespace Database\Seeders;

use App\Models\Source;
use Illuminate\Database\Seeder;

/**
 * The known collectors (ADR-0009). Idempotent: re-running updates names/weights only.
 */
class SourceSeeder extends Seeder
{
    public function run(): void
    {
        $sources = [
            ['code' => 'telegram_uz', 'name' => 'telegram.uz — Telegram channel collector', 'trust_weight' => 1.00],
            ['code' => 'geo_uz', 'name' => 'geo.uz — web source collector', 'trust_weight' => 0.90],
            ['code' => 'datahub_uz', 'name' => 'datahub.uz — canonical properties', 'trust_weight' => 1.50],
        ];

        foreach ($sources as $source) {
            Source::query()->updateOrCreate(['code' => $source['code']], $source);
        }
    }
}
