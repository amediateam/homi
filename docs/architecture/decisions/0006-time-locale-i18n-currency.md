# ADR-0006: Time, locale, translations and currency defaults

- Status: Accepted
- Date: 2026-11-08
- Deciders: developer (Phase 0 checkpoint L)
- Source: `docs/about.md`; `docs/ai/reports/phase-0.md` §5–6 (B6 reuse candidate), §14

## Context

The product serves Uzbekistan in Russian, Uzbek and English; users choose language and currency. Listings arrive with prices in USD or UZS. The reference codebase has a proven jsonb translation trait (`app/Support/Localization/HasTranslations.php`, `LocaleRegistry.php`) with a fallback chain, and uses `ru` as the default locale.

## Decision

- **Time**: stored in UTC (`APP_TIMEZONE=UTC`, `timestamptz` columns), displayed in `Asia/Tashkent`; API returns ISO-8601 with offset. `CarbonImmutable` everywhere (already configured in `AppServiceProvider`).
- **Locales**: `ru` (default and translation fallback), `uz` (Latin script), `en`. Request locale from `Accept-Language` or the user's saved preference; `APP_LOCALE=ru`, `APP_FALLBACK_LOCALE=ru`.
- **Translatable DB fields**: one `jsonb` column per translatable attribute (`{"ru": …, "uz": …, "en": …}`) using the ported `HasTranslations` trait; fallback requested → `ru` → first non-empty.
- **Currency**: prices stored as integer minor units with an explicit `currency` column (`UZS`|`USD`) in the source currency; default display currency **UZS**; conversion uses a daily rate table (source decided with the first pricing feature). Market statistics are computed per currency, never on mixed values.
- Static UI strings: Laravel `lang/{ru,uz,en}` for API messages; Next.js apps keep their own message catalogues in `frontend/packages/config` (shared) — no server round-trip for UI copy.

## Consequences

- Migrations for listings, regions and districts use `jsonb` name columns and `timestamptz`.
- Port `HasTranslations` + `LocaleRegistry` from `app.uz` with the locale list changed to `ru, uz, en`.
- Seed data for regions/districts must ship all three languages (the `app.uz` seeder has ru/uz/en for 14 regions and Tashkent districts; extend districts for other cities).
- Telegram `language_code` may pre-select the locale for new users but `ru` remains the fallback.

## Alternatives considered

- USD as default currency — rejected by the developer (UZS default).
- `spatie/laravel-translatable` — rejected: the in-house trait is proven in the team's codebase and has no extra dependency.
