# Requirements (derived from `docs/about.md`)

Purpose: turn the preliminary Russian product description into trackable requirements. Labels: **CONFIRMED** (developer confirmed or observable), **ASSUMED** (taken from `about.md`, not yet confirmed), **OPEN** (needs a product answer). Update labels in the PR that confirms them; keep IDs stable.

## Functional

| ID | Requirement | Label | Notes |
|---|---|---|---|
| FR-01 | Aggregate rent and sale housing listings from Telegram channels and web sources into one feed | CONFIRMED | Collection happens in `telegram.uz` / `geo.uz`; HOMI receives pushes (ADR-0009) |
| FR-02 | Deduplicate the same property across sources into one card listing all sources | ASSUMED | Algorithm/thresholds OPEN |
| FR-03 | Feed sorted by time; toggles Rent/Sale and New-build/Resale | ASSUMED | |
| FR-04 | Filters: city, district, rooms, property type (apartment/house/room/commercial), budget + currency, rent term (long/daily), hide agencies | ASSUMED | |
| FR-05 | Map (OpenStreetMap) with price distribution by district; marker hover shows nearby offers | ASSUMED | Tile provider/licensing OPEN |
| FR-06 | AI tag "from owner" vs "from realtor" from listing text | ASSUMED | Provider decided later (checkpoint AI) |
| FR-07 | "Below market" badge when price ≈20% under district median | ASSUMED | Exact definition OPEN |
| FR-08 | Radar: Telegram notifications for new listings matching saved filters, including free-text queries | ASSUMED | Free-text parsing via AI |
| FR-09 | Favourites (♡) and "already rented" hide | ASSUMED | |
| FR-10 | Market analytics: medians by rooms, monthly dynamics, district heatmaps, CSV export | ASSUMED | |
| FR-11 | UI in ru/uz/en; user chooses language and currency | CONFIRMED | Defaults ru + UZS (ADR-0006) |
| FR-12 | Telegram Mini App + PWA; no separate registration, Telegram ID is the identity | CONFIRMED | Bearer tokens (ADR-0003) |
| FR-13 | Closed-beta waitlist | ASSUMED | Pennant feature flags |
| FR-14 | `/privacy` bot command deletes all user data | ASSUMED | Backups handling OPEN |
| FR-15 | Support chat with voice-message transcription | ASSUMED | Low priority |
| FR-16 | Admin (ARM): moderation, sources, users, stats | CONFIRMED | Roles OPEN |

## Non-functional

| ID | Requirement | Label |
|---|---|---|
| NFR-01 | Mobile-first, works inside Telegram WebView | CONFIRMED |
| NFR-02 | Fresh listings within minutes of source publication | ASSUMED |
| NFR-03 | Minimal personal data: Telegram ID, locale, filters, favourites; phone stored only hashed | ASSUMED |
| NFR-04 | Free, no ads | ASSUMED |
| NFR-05 | Three environments, HTTPS everywhere, separate buckets/DBs/bots per environment | CONFIRMED (mandate) |
| NFR-06 | Analytics via PostHog (EU) without personal identifiers | OPEN (account exists?) |

## Entities (draft)

User, Listing, ListingSource, Photo, Property (dedup cluster), Region, District, PropertyType, DealType, RentTerm, Price (amount, currency), MarketStat, RadarSubscription, Notification, Favorite, Report, WaitlistEntry, Source (collector), IntakeEvent.

## Open product questions

- OPQ-1 Dedup rules and confidence thresholds (datahub uses >0.95 auto-merge, 0.70–0.95 review).
- OPQ-2 "Below market" median window (30/90 days?) and minimum sample size.
- OPQ-3 Which cities/districts beyond Tashkent at launch.
- OPQ-4 ARM roles and who moderates.
- OPQ-5 Data retention for raw payloads and deleted users (incl. backups).
