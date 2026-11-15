# ADR-0020: Mini App CSP — a nonce per request, so every document of the app is rendered at request time

- Status: Proposed
- Date: 2026-11-15
- Deciders: development track (spike of WP-21 step 1); first developer (review of this PR)
- Source: `docs/migration/wave-1/WP-21-telegram-and-session.md` step 1 and "Handoff"; `docs/migration/25-wave-1-plan.md`
  §3.1, §3.10; SEC-REQ-031; `frontend/app/node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`;
  amends ADR-0018

## Context

ADR-0018 asks for a nonce-based CSP from `proxy.ts` and leaves open how it combines with `cacheComponents`, which
prerenders a static shell per route. The bundled guide says a nonce needs dynamic rendering and that partial
prerendering is incompatible with it. The spike measured it on a production build of `frontend/app` (Next.js
16.4.5, Chromium of Playwright 1.65.1), with `script-src 'self' 'nonce-…' 'strict-dynamic'` sent by `proxy.ts`:

- **Static shell kept (WP-20 as merged).** `/ru` is prerendered (`○`/`◐`); none of its 23 script tags carries a
  nonce, the browser blocks all 23 (`script-src-elem`), and the app never hydrates.
- **Root layout reads the nonce.** `app/[locale]/layout.tsx` awaits `headers()` outside `<Suspense>` and exports
  `instant = false` (the documented "blocking route" option, `01-app/02-guides/building.md`). Every route becomes
  `ƒ`; all 31 script tags of `/ru` and of `/ru/listing/42` carry the request's nonce; zero violations; an inline
  `<script nonce>` of the layout runs, and an `async` `<script>` in `<head>` keeps its place and its nonce. Next.js
  sends `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` on these documents. The WP-20
  end-to-end suite passes on that build except the 404 case below.
- **Hashes instead of a nonce** (the experimental `sri` option plus hashes of the inline scripts) was not built:
  `sri` adds `integrity` to the external chunks only, while the inline flight-data scripts
  (`self.__next_f.push(…)`) that the server streams differ per request, so they could not be listed by hash without
  `'unsafe-inline'`.

## Decision

Nonce-based CSP with every document of `frontend/app` rendered at request time (option (a) of WP-21).

- `proxy.ts` makes a fresh nonce per document request, sends the policy as the response header and as the request
  header Next.js reads the nonce from, and passes it on as `x-nonce`.
- The root layout `app/[locale]/layout.tsx` reads `x-nonce` with `headers()` and exports `instant = false`; its own
  inline scripts and the Telegram SDK tag carry that nonce, the framework adds it to its own scripts.
- Nothing per user was ever cached (ADR-0018); this also gives up the static shell of each route. Client-side
  navigations are unchanged: they fetch RSC payloads, and the chunks they load are trusted through `'strict-dynamic'`.

**Amends ADR-0018**, consequence "The CSP is nonce-based … chooses between nonces with dynamic rendering and hashes":
the choice is nonces with dynamic rendering.

## Consequences

- Each launch renders its first document on the app server; there is no prerendered HTML to serve from a cache. The
  production track keeps nginx from caching documents of the app (WP-21, "Needs from the production track").
- An address that matches no route renders the not-found screen with `noindex`, but with status `200` instead of
  `404` (measured on `/ru/unknown` and `/en/listing`; the cause inside Next.js was not traced). The Mini App is not
  a search surface (ADR-0018), so only the WP-20 end-to-end case changes (AM-57).
- Pages may still use `<Suspense>` and `"use cache"` for reference data; `instant = false` only switches off the
  instant-navigation validation of the root layout.
- If Next.js later lets a static shell carry a per-request nonce, a new ADR can bring the static shell back.

## Alternatives considered

- Hash-based policy with `sri`, keeping the static shell — rejected: the streamed inline scripts cannot be hashed
  ahead of time.
- Asking the developers to change `25` §3.10 (no nonce, `'unsafe-inline'`) — rejected: SEC-REQ-031 asks for a strict
  policy, and the cost of request-time documents is small for a Mini App that loads one document per launch.
