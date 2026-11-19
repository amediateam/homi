# Phase 3 — working notes (inputs gathered before the pause)

Purpose: facts collected by two read-only subagents on 2026-11-08 so the remaining Phase 3 work (CDN/webhook infra templates, Telegram pipeline, intake) starts from evidence, not memory. Nothing here was verified against live servers; "inferred" marks the subagent's inference. No secrets were read or copied. Mirror roots are the machine-local paths named `NGINX_MIRROR_CDN` (31.220.104.38) and `NGINX_MIRROR_WEB` (159.253.19.121) in `.ai/local.env`; paths below are relative to them.

## A. Production CDN / MinIO host (31.220.104.38)

### Topology
- `s3.hc.uz` — the S3 API endpoint (path-style, `MINIO_DOMAIN` unset) and an edge cache for the public buckets (`telegram-media`, `offer`, `banners`). MinIO listens on `127.0.0.1:9000` only; console on `127.0.0.1:9001` behind `cmd.hc.uz` + IP allowlist.
- `cdn.proagent.uz`, `cdn.smartagent.uz` — one domain → one public bucket, **SPA hosting** (`index.html` fallback). Not the media pattern (confirms AM-8).
- `img.elbozor.uz` serves local disk, not MinIO. `p.hc.uz` = Grafana/Prometheus/Alertmanager.
- MinIO: native binary under systemd (`minio.service`, `Type=notify`, `EnvironmentFile=/etc/minio/minio.conf`, `ReadWritePaths=/data/minio`, hardened unit), single node / single disk, `RELEASE.2025-09-07` (frozen OSS release — accepted risk in their 2026-07-09 audit), `MINIO_SERVER_URL=https://s3.hc.uz`, `MINIO_REGION=us-east-1`, `MINIO_API_REQUESTS_MAX=4096`, `MINIO_SCANNER_SPEED=slow`.
- Client tool: `mcli` with alias `s3hc`. Applications receive endpoint `https://s3.hc.uz`, region `us-east-1`, path-style.
- Buckets (as of 2026-06-22): `elmarket-pgbackrest` (private, versioned, 50 GiB), `telegram-media` / `smartagent` / `proagent` (public-read GetObject only, 50/5/5 GiB). One IAM user per bucket.

### The public-media edge-cache block to clone for `cdn.homi.uz` (`sites-available/hc/s3.hc.conf:73-99`)
```nginx
location ~* ^/telegram-media/ {
    limit_req zone=static burst=100 nodelay;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Cache-Control "public, immutable, max-age=2592000" always;
    add_header X-Cache-Status $upstream_cache_status always;
    include /etc/nginx/snippets/proxy-buffers-minio.conf;
    proxy_read_timeout 600;
    proxy_buffering on;              # required for proxy_cache (the snippet turns it off for the streaming API)
    proxy_request_buffering off;
    proxy_cache s3_cache;
    proxy_cache_valid 200 30d;
    proxy_cache_valid 404 1m;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503;
    proxy_cache_lock on;
    proxy_cache_lock_timeout 5s;
    proxy_cache_revalidate on;       # ETag revalidation
    proxy_ignore_headers Set-Cookie Cache-Control Expires;
    proxy_pass http://127.0.0.1:9000;
}
```
Shared pieces: `snippets/proxy-buffers-minio.conf` (`proxy_http_version 1.1`, `Connection ""`, `Host $http_host`, X-Real-IP / X-Forwarded-*, hides upstream HSTS/nosniff/XSS headers, connect 300 s / send 600 s), `snippets/s3-admin-deny.conf` (403 on `/minio/(health|v2/metrics|admin)/`), `snippets/security-headers.conf` (HSTS preload, nosniff, `X-Frame-Options DENY`, Referrer-Policy, Permissions-Policy). Cache zone in `nginx.conf:110-114`: `proxy_cache_path /var/cache/nginx/s3_cache levels=1:2 keys_zone=s3_cache:100m max_size=20g inactive=7d use_temp_path=off`. Rate-limit zones (`nginx.conf:130-140`): `api` 10 r/s, `web` 20, `static` 50, `critical` 3, `media_limit` 10, keyed by `$binary_remote_addr`. Globals: `access_log off` (vhosts set their own, `/var/log/nginx/<project>/…`), `client_max_body_size 32m`, `server_tokens off`, gzip level 5 with `gzip_proxied any`.

Dedicated-domain pattern worth copying from `cdn.proagent.conf`: `proxy_cache_key "$scheme$host$request_uri"` (shared zone, no cross-tenant collisions), `proxy_hide_header Cache-Control` + own immutable header, security snippet re-included inside every `location` (nginx `add_header` inheritance), `proxy_pass http://127.0.0.1:9000/<bucket>/…`, ACME webroot `/var/www/certbot` on the port-80 server, `proxy_intercept_errors on` because anonymous GetObject without ListBucket makes MinIO answer **403** for a missing key.

Gaps the subagent flagged (inferred): the `telegram-media` block has no `proxy_cache_key` (default key = scheme + upstream + URI); its own `add_header` lines drop the server-level X-Frame-Options/Referrer-Policy/Permissions-Policy.

### Decisions already taken on that host (reuse, do not re-litigate)
- TLS: one Let's Encrypt cert per host (no wildcard), `listen 443 ssl; listen [::]:443 ssl; http2 on;`, `include /etc/letsencrypt/options-ssl-nginx.conf; ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;` (TLS 1.2/1.3, tickets off), OCSP stapling deliberately off (ECDSA LE certs). `cdn.*` certs via ACME webroot, others via the certbot nginx plugin. Renewal deploy hook: `nginx -t && systemctl reload nginx`. Default server: 444 on :80, `ssl_reject_handshake on` on :443.
- **CORS is global in MinIO** (`MINIO_API_CORS_ALLOW_ORIGIN=*`, reflects Origin, `Vary: Origin`); per-bucket `mcli cors set` returns `NotImplemented`; nginx sets no `Access-Control-*`. Narrowing: `mcli admin config set s3hc api cors_allow_origin="https://a,https://*.b"` + `mcli admin service restart s3hc` — affects every bucket (needs the owner's OK). The `cdn-deploy-guide.md` is **stale** on this point.
- **Anonymous access = `GetObject` only** (`mcli anonymous set-json`), never the built-in `download` policy (it grants ListBucket → enumeration; closed 2026-06-17).
- No bucket event notifications (`notify_webhook`/`mcli event add`) exist anywhere → HOMI must not depend on a MinIO→Laravel webhook; the `register` step after presigned uploads (already implemented) is the right design. Audit webhook → local collector on 127.0.0.1:8899.
- Lifecycle pattern: `mcli ilm rule add s3hc/<bucket> --expire-days 30 --prefix tmp/`; off-host backup MinIO with versioning + `--noncurrent-expire-days 30`.

### Bucket onboarding (their idempotent script `server/scripts/onboard-project.sh`, dry-run unless `APPLY=1`)
```bash
mcli mb s3hc/<bucket>
mcli quota set s3hc/<bucket> --size 50GiB
mcli admin policy create s3hc <bucket>-rw <policy.json>     # rw | ro | wo variants
mcli admin user add s3hc <bucket>-app "$(openssl rand -hex 20)"   # secret shown once, never stored
mcli admin policy attach s3hc <bucket>-rw --user <bucket>-app
mcli anonymous set-json <anon.json> s3hc/<bucket>            # public-read buckets only
```
```json
// <bucket>-rw
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket","s3:ListBucketMultipartUploads"],"Resource":["arn:aws:s3:::<bucket>"]},
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload","s3:ListMultipartUploadParts"],"Resource":["arn:aws:s3:::<bucket>/*"]}]}
// anonymous public-read (no ListBucket)
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::<bucket>/*"]}]}
```
HOMI plan derived from this (for `docs/infrastructure/cdn.md` + `infra/server/minio/provision.sh`, to be run by the developer with `APPLY=1`): buckets `homi-public` (anon GetObject), `homi-private`, `homi-tmp` (+ `homi-staging-*`), users `homi-app` / `homi-staging-app` with rw policies scoped to their three buckets, ilm `--expire-days 1` on `homi-tmp`, quotas to agree with the owner. `cdn.homi.uz` vhost = dedicated-domain edge cache in front of `homi-public` only (`proxy_pass http://127.0.0.1:9000/homi-public/`), immutable cache for `originals/` and `derived/`, 403→404 mapping, no SPA fallback, no private bucket exposure.

## B. Production web host (159.253.19.121) — conventions for `api.homi.uz`, `hook.homi.uz`, Next apps
- Debian 12, nginx 1.30.x, PHP 8.5 via `fastcgi_pass unix:/run/php/php8.5-fpm.sock` (elbozor/gram on 8.4), `fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name`, fastcgi buffers 64k/32×32k, timeouts 10s/30s/30s, `fastcgi_keep_conn on`; `client_max_body_size 50m` for APIs; per-host LE certs ("managed by Certbot"); HSTS `includeSubDomains`; dotfiles denied; static assets `expires 30d` immutable; Laravel API example `app/api.app.conf` (answers only the OPTIONS preflight in nginx via an internal `/cors-preflight` location — real CORS headers come from Laravel; `fastcgi_param HTTP_APP api` tags the vhost).
- Only Node reverse proxy on the host: `agentim/demo.agentim.conf` → `next start -p 3021` behind `upstream … keepalive 32`, `/_next/static/` served from disk as immutable 1y, everything else `try_files $uri @next`, `X-Forwarded-Proto/Host`, `proxy_read_timeout 90s`, logs `/var/log/nginx/<project>/{access,error}.log`. Most other `app.*`/`arm.*` vhosts are static builds — HOMI's three Next apps need the proxy pattern (SSR) or a static export decision (open question since Phase 1).
- `cdn.app.uz` (the reference app) serves `backend/storage/app/public` from disk with `Access-Control-Allow-Origin *` and 1y immutable — the same shape HOMI uses locally (ADR-0012).

## C. `app.uz` sources fetched for porting (catalogue A4/A5/A6, B2/B3)
Verbatim dump (2063 lines, 14 items) was written to the session scratchpad `appuz-port-sources.txt`; it is temporary — re-run the read-only fetch if missing. Port caveats recorded by the subagent:
- `HashedUploader`/`GenerateImageVariantsJob` depend on app.uz `BucketDiskFactory` (DB-driven buckets) → HOMI uses plain disks via `config/media.php` (**already done**, implemented from the catalogue spec with TDD; S3 conditional PUT `If-None-Match: *` from app.uz is not used — `exists()` check instead).
- Gramir `webhook_events` migration's pgsql CHECK allowed only `meta|pay`; `telegram_bot` and `crm`/`ignored` were added by later migrations → HOMI's `telegram_updates` table has no provider CHECK (already migrated).
- `getWebhookInfo` is not in `TelegramChannel`; it lives in `app/Services/Qulay/Telegram/BotApi.php:163`.
- Middleware depends on `GramirResponse` and `Account.credentials['webhook_secret']` → HOMI reads the secret from `config('telegram.webhook.secret')`.
- app.uz `configureRateLimiting` is ~320 lines / ~50 limiters; only `api`, `api-login`, `uploads`, `bot-webhook`, `smartagent-tg-auth`, `gramir-webhook` were fetched (HOMI's four limiters already defined).
- Test fixtures in the dump (`'super-secret-32-bytes-min-token'`, `'t:ok'`, `'sec'`) are fake values, not secrets. Docblocks are Russian → rewrite in English when porting.

## D. Development track, 2026-11-09 — kvadro² migration audit and plan

The developer set a new goal for the development track: move the running product kvadro² onto HOMI. The master prompt is kept local as `writing-block.md` and is not committed (machine paths). The remaining Phase 3 work (T1 webhook, T2 intake, T3 OpenAPI, T4 close + ADR-0014) is kept and extended by the migration tasks. The mapping is in `docs/migration/10-target-architecture.md` §9.

Status:
- **Applied** on branch `docs/kvadro-migration-audit`, PR #9, not merged:
  - `docs/migration/`: the audit, the plan (01–23), 383 task files and the registers in `data/`;
  - `scripts/migration/`: the ID, open-question and task-graph checks. They are written in Python 3 with the standard library only, so they need no new dependency.
- **Not applied:**
  - no application code;
  - the `HANDOFF.md` §4 changes (`10` §9);
  - the plan's ADRs: KV-BE-001, KV-DB-004, KV-DB-005, KV-BE-120;
  - the guard key for the legacy tree (KI-26);
  - the Media ownership fix (KI-25, task KV-BE-002).

Developer decisions (2026-11-09):
- Audit the legacy product and write the full plan before any migration code. The legacy tree is read-only: «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.»
- «в homi.uz мы будем исправлят старые ошибки и логические не верные решение». This became the migration policy in `docs/migration/README.md`: parity covers capabilities, data and public links, and every behaviour change is a DEV item that needs approval. No separate ADR was written; the plan's ADR tasks above carry the policy.
- «да, закоммить и открой PR, writing-block.md не коммить». Done as `b6aa0e6`, PR #9.

ASSUMPTION_MISMATCH AM-44 (2026-11-09):
- **Assumption.** ADR-0009 and `.ai/memory/current-state.md` (Collectors) assume collectors push listings into HOMI's intake.
- **What was found** (reported by `reference-reader`, not re-run):
  - `telegram.uz` offers only a pull API (`/api/public/v1/listings`) and pushes nothing to HOMI;
  - its production use is not confirmed;
  - `geo.uz` is not a housing source;
  - none of the collectors mentions kvadro.
- **Resolution.** Recorded as CF-007 / DEC-02 in `docs/migration/10`: our own channel reader first, `telegram.uz` after a side-by-side run. ADR-0009 stays unchanged until DEC-02 is answered.

ASSUMPTION_MISMATCH AM-45 (2026-11-09):
- **Assumption.** The migration docs were written before PR #8 landed. They assumed nothing was deployed and used the ADR-0011 database names `homi_staging` / `homi_production`.
- **What PR #8 brought:**
  - live staging and production, with the databases `homi_db` / `homi_staging_db`;
  - Redis DB indexes on a shared instance;
  - Horizon units;
  - `homi-deploy`.
- **Resolution, before the commit:**
  - names corrected;
  - DEC-27 recorded as answered;
  - reconciliation notes added to KV-INF-015, KV-INF-019 and KV-INF-023;
  - `collect_ids.py --check` and `task_graph.py --check` re-run, exit 0.

## E. Development track, 2026-11-14 — three-wave order and the Wave 1 plan

The developer changed the order of the kvadro² migration. The prompt is kept local as `prompt.md` and is not committed (machine paths). PR #9 (section D) was merged into `main` before this session.

Status:
- **Applied** on branch `docs/three-wave-plan`, PR #25, not merged:
  - `docs/migration/24-three-wave-strategy.md`: the three waves, the API gateway, what moves in 21 / 18 / 22, decisions DEC-31…DEC-39, seven questions, risks RK-24…RK-28;
  - `docs/migration/25-wave-1-frontend-plan.md`: the Wave 1 plan (Next.js architecture, structure, inventory by stage, API proxy, porting method, parity run, stages W1-0…W1-9 with exit criteria) — **replaced the same day**, see section F;
  - notes in `docs/migration/README.md`, `21` (top, §20) and `22` (top, §5); `20` §2 and `data/ids.csv` regenerated by the scripts.
- **Not applied:**
  - no application code;
  - the ADR for the new order (see the first decision below);
  - task files for the new items N1…N9 and the `Dependencies` cells of the 87 Wave 1 tasks (`25` §11);
  - the guard key for the legacy tree (KI-26) and the Media ownership fix (KI-25): unchanged.

Developer decisions (2026-11-14):
- Three waves: «Разработку разделим на три волны. Основной принцип — постепенный переход на новую архитектуру без остановки работающего сайта и нарушения существующей функциональности.» Recorded as DEC-31 in `24`. It changes the process and the role of `frontend/app` (ADR-0013), so it needs an ADR. The ADR is **not drafted yet**: it is a shared file and goes into its own small PR after the review of PR #25, together with the gateway placement (DEC-35). Next free number: 0016.
- Wave 1 talks to legacy production: «Все API-запросы направлять через прокси к существующему Production Backend.» The plan turns this into a manual `live` mode for a developer on a test account (`25` §6.3, DEC-33, `PROPOSED`); tests, CI and agents stay on mocks. Until DEC-33 is answered the prohibition of `22` §4 stands.
- Wave 1 keeps behaviour: «Не менять поведение сайта на этом этапе.» Reconciled with the policy of 2026-11-09 ("fix, do not port") as DEC-36, `PROPOSED`: only crash- and security-class defects are fixed in Wave 1.
- «да, закоммить и открой PR» — done as `cf4d325`, PR #25. «да, сохрани сессию» — this commit.

Choices made while writing the plan (all `PROPOSED`; the developers decide):
- the gateway is nginx, not Next.js rewrites, `proxy.ts` or a Route Handler (`24` §3);
- port the recovered sources module by module into TypeScript instead of rebuilding each screen from the audit (DEC-32). This departs from `12` §1 rule 5;
- the landing and SEO pages stay on legacy during Wave 1 (DEC-38).

Found while planning:
- The audit trails legacy production by two Mini App releases (Q-APP-024).
- Wave 2 has no answer yet for routes that share data with each other and with the bot (DEC-39, RK-24).
- Checks: `collect_ids.py --check` → exit 0 (2 209 identifiers); `build_open_questions.py` → 242 questions; `task_graph.py --check` → exit 0.

## F. Development track, 2026-11-14 (later) — answer round and the rewritten plan

After section E the developer asked for every open question, one at a time, and answered 43 of them. The answers replace most of the first draft: HOMI ships a **new product** under its own bot and brand instead of taking over the legacy bot, hosts and users.

Status:
- **Applied** on branch `docs/three-wave-plan`, PR #25, not merged:
  - `docs/migration/decisions/2026-11-14-developer-answers.md`: the answers, verbatim;
  - `docs/migration/24-three-wave-strategy.md`: rewritten — the new product, `/api/v1` with a source driver per method, decisions DEC-31…DEC-49 (answered), questions for the operator, risks RK-24…RK-31;
  - `docs/migration/25-wave-1-plan.md`: new (replaces `25-wave-1-frontend-plan.md`) — frontend and API architecture, native modules, bot, landing, acceptance;
  - `docs/migration/wave-1/`: the queue (`README.md`) and one specification per work package (44 files);
  - notes in `docs/migration/README.md`, `21` and `22`.
- **Not applied:** no application code; the four ADRs (package WP-01, each in its own PR); the changes to `docs/handoff/parallel-work.md`, `HANDOFF.md` §4 and `CLAUDE.md` (also WP-01); the earlier task files and `data/tasks.csv` are unchanged and now serve as behaviour reference.

Developer decisions (2026-11-14, answer round; full list in the decisions file):
- New permanent product: «Пока будет новый бот с нашим backend старый бот будет работат в старом»; «Постоянный новый продукт»; brand «HOMI, дизайн тот же»; users are not migrated («Без переноса данных»).
- Architecture: rebuild from the audit («Пересборка по аудиту»), «Tailwind 4 + токены», «Полный App Router», «На сервере через cookie-сессию», «Laravel как шлюз», «Сразу новый /api/v1», «shadcn/ui + Radix», «next-intl, язык в адресе», both map engines.
- Data: personal data in HOMI, listings from legacy through a service key («Живой прокси, сервисный ключ»); after legacy «Коллектор telegram.uz».
- Scope of Wave 1: radars «Полностью в HOMI», «Полный паритет бота», «Полный лендинг как у legacy», admin panel out, access «Открыт всем сразу».
- Process: «Крупные PR по модулям»; two developers in relay («фуллстак только по очереди…»); «Сначала весь фронтенд на моках»; «Всё сразу на prod»; checks inside Telegram «сразу в staging и prod»; «Срока нет, важнее полнота»; KV-BE-002 «Первой задачей»; dependencies «Согласовано всё пакетом».

These decisions change architecture, stack and process, so they need ADRs. The ADRs are **not drafted yet**: they are shared files and are the content of package WP-01. Three project rules are affected and need the first developer's agreement in the review of PR #25: PR size (`docs/handoff/parallel-work.md` §2), the dependency approval route (§4 there), and the deploy cadence to production.

Choices made while writing the plan (the developers can change them in the review):
- one Pennant feature per method whose value names the driver (`stub`, `legacy`, `native`), and `meta.source` in every answer;
- a visible "demo data" marker on screens that still answer from stubs, because every merge reaches production and access is open (RK-27);
- every per-user table stores the source channel and post next to the listing number, to survive the change of listing identity in Wave 2 (Q-API-063);
- the two session modes (cookie, header) share one screen implementation;
- the specifications of the work packages were drafted by three subagents from the audit and the earlier task files, then checked by the main session (see the handoff for what was checked).

Checks at the last commit of this section: 44 specification files, each with the template's field table and ten sections (shell loop); `collect_ids.py --check` → exit 0; `build_open_questions.py` → 245 questions; `task_graph.py --check` → exit 0; the v1 methods named in the specifications against `25` §4.2 → none undefined (script); path and address scan → no hits. Coverage totals (45/45 screens, 69/69 client rules, 47/47 client defects, 84/84 bot handlers, 76/76 buttons, 88/88 texts) are the authors' reports, not re-counted. The subagents hit the usage limit twice and were resumed.

## G. Development track, 2026-11-14 (evening) — verification pass over the Wave 1 specifications

The developer asked whether the colleague can start and whether the plan leaves no question. The honest state was:
written in full, read against the code only in part. So a second pass was run.

- WP-00 … WP-03 were read by the main session against the code they change. WP-00 had four defects (a validation
  pattern that rejects the new upload key and was not listed; a generator command with the wrong namespace;
  `media_files.uploaded_by` is a foreign key to `users` but receives the id of any actor; the variants job fails
  before `handle()` when its row is deleted). WP-03 and WP-21 designed the fake Telegram twice.
- The other 40 specifications were read by three agents (API, Mini App, bot with landing and launch) against the
  repository, against each other, against `25` and for executability: 58 + 81 + 71 corrections. The main session
  sampled 26 of their claims against the framework source, the application code and the bundled Next.js
  documentation; all 26 held.
- One thing was settled by the main session for all packages: tests of concurrent writes. They live in
  `backend/tests/Pgsql/` with their own base class, run only against a database whose name ends with `_test`, and
  use one helper `concurrently()`; WP-03 builds this (it was undefined, and seven packages needed it).
- `25` §4.2: the two `GET /landing/*` methods are public (the note said otherwise).
- The test phone numbers of WP-26 and WP-32 were replaced by plainly synthetic ones.

Not covered by the pass (also stated in `docs/migration/wave-1/README.md`): nothing was executed; texts, constants
and thresholds were not compared line by line with the audit; the behaviour of packages that are not installed yet
and of the Telegram Bot API is worded "verify before writing".

Checks at the commit: 44 files with the template's field table and ten sections (script); `collect_ids.py --check`
→ exit 0; `build_open_questions.py` → 245 questions; `task_graph.py --check` → exit 0; every repository path named
in the specifications exists or is created by a package (script); address and token scan → no hit.

## H. Development track, 2026-11-14 (night) — second answer round, support bot

The developer answered eight more questions (answers 44–51, verbatim in
`docs/migration/decisions/2026-11-14-developer-answers.md`), registered as DEC-50 … DEC-56 in `24` §8.1:

- DEC-50: the "demo data" marker stays (confirms RK-27's mitigation).
- DEC-51: creating and changing radars is switched off (`RADAR_CREATION_ENABLED`) until the bot's sending package
  WP-57 is live; the radar tab and the bot say "soon". Telegram checks of radar features move to WP-57.
- DEC-52: the author's phone number only after a tap — never on the card, masked in texts, given by the counted
  contact method (a deliberate difference from legacy, no flag).
- DEC-53: favourites and history paged by 20 with a cursor (no flag).
- DEC-54: the whole-city label «{city} целиком» in the Mini App and the bot (no flag; uz and en to proofreading).
- DEC-55: no fixed language-model vendor; provider and model come from configuration (answers DEC-03).
- DEC-56: HOMI's own support bot, relaying to the operators' private chats (answers DEC-21) — new work package
  WP-59; the queue has 45 packages.

The five behaviour decisions were carried through 32 specifications by one agent; the main session reviewed the
seams (callback registry, dependencies, the claim about env reload checked against
`docs/infrastructure/deployment.md`), aligned `24`, `25` and the queue, and wrote WP-59. Defaults chosen in that
work, open to change in the review: numbers of other people inside a listing text stay masked; `has_phone` does not
look at the quota (a refusal comes on the tap); the bot sends the number as a separate message; a temporary switch-on
of radars on staging is allowed for the check of WP-46, never on production.

Checks at the commit: 45 files with the template (script); `collect_ids.py --check` → exit 0;
`build_open_questions.py` → 245 questions; `task_graph.py --check` → exit 0; repository paths named exist or are
created by a package (script); address and phone scan → only synthetic numbers.

## I. Development track, 2026-11-14 (late night) — WP-00, media ownership fix

Developer's go: «Возьми первый пакет очереди со статусом не DONE. Сейчас это WP-00 …; добро на него дано.» Rules of
that prompt kept: one package = one branch = one PR; no dependency, staging or production changes; legacy untouched.

**Applied** (branch `feat/wp-00-media-ownership-fix`, PR #27, CI `ci` pass; companion draft PR #28 for
`.ai/memory/known-issues.md`):

- `media_file_references` (owner type and id as text, no global morph map), owner-scoped show and delete with
  `MediaFilePolicy`, uploads that attach the owner under the row lock, reference-counted delete, actor-typed presign
  prefix, the variants job dropping itself or its own variants when its row is gone; backfill of one user reference
  per row with an uploader.
- After the `security-reviewer` pass: `whereUlid('media')` on show and destroy, `throttle:api` on the v1 group (the
  limiter was defined but not attached), `$/D` in the register key pattern, re-dispatch of the variants job for a
  `failed` row, `uploaded_by` cleared when the uploader lets go.
- Own choices: `MediaFile::recordFor()` as the one upload entry point, `const UPDATED_AT = null` on the reference
  model, a Source signs in with a real token in tests (`Sanctum::actingAs()` needs an `Authenticatable`).
- Checks: RED first (media suite 27 of 54 passed before the code); `make ci-backend` exit 0 with Pest 92 of 92,
  PHPStan 0 errors; `collect_ids.py --check` and `task_graph.py --check` exit 0.

On the developer's go («да, это моя dev-база, прогони migrate») the migration ran on the dev database (PostgreSQL
18.6); backfill, `down()`/`up()`, a double `attachOwner()` and the owner scope under `FOR UPDATE` were checked there in
a rolled-back transaction. **Not applied:** not deployed; the parallel-upload race on PostgreSQL is not tested. KI-27 (object deletion is one attempt, failures
swallowed) and KI-28 (presign without a size bound) are open, filed in PR #28.

ASSUMPTION_MISMATCH AM-50 (2026-11-14):
- **Assumption.** The WP-00 specification assumed an upload by a `Source` token could have written a `media_files` row
  that stores the source's number as `uploaded_by`, and made the backfill depend on a count of source tokens.
- **What was found.** A `Source` is not `Authenticatable`. `AppServiceProvider::actorKey()` (the `throttle:uploads`
  key) and both media controllers called `getAuthIdentifier()`, so every source request to the upload routes ended in
  `BadMethodCallException` → `500` before any row was written (the source cases of the new tests failed that way on
  the old code).
- **Resolution.** The backfill is unconditional; the source-token count was dropped from "Needs from the production
  track"; `actorKey()` uses the model class and key; the specification was corrected in PR #27.

## J. Development track, 2026-11-14 (night) — WP-01, ADRs and shared files

Developer's go: «бери следующий пакет WP-01». WP-01 is the one package that is split into small separate PRs
(shared files and ADRs, `docs/handoff/parallel-work.md` §1). All eight were opened from fresh `origin/main`, each in
its own git worktree. The shared working tree stayed on the WP-00 branch.

**Applied (all open, none merged; the first developer reviews each):**

- #29 `chore/guard-kvadro-root` (KI-26). `KVADRO_ROOT` becomes a reference key and `kvadro.uz` a fallback folder name.
  Under the legacy tree the guard gives its own deny reason. It also carries the queue status `REVIEW (PRs #29 … #36)`
  and the spec's Handoff.
- ADR PRs, all `Proposed` until approved:
  - #33 ADR-0016: new product, three waves;
  - #34 ADR-0017: `/api/v1` with source drivers, amends 0007;
  - #35 ADR-0018: Mini App architecture, amends 0003 and 0013;
  - #36 ADR-0019: UI stack, amends 0006.
- Shared-file PRs:
  - #30 `parallel-work.md` §2 and §8: the Wave 1 PR size and relay rule;
  - #31 `HANDOFF.md` §4: mapped onto the work packages;
  - #32 `CLAUDE.md` and `AGENTS.md`: pointer to the migration queue (to merge after #29).
- Own choices, each named in its PR:
  - Under the legacy tree the deny reason quotes DEC-32. The generic reason says "port single files", which DEC-32
    forbids for legacy.
  - T0 is named among the unchanged HANDOFF tasks.
  - ADR-0018 states that DEC-44 replaces three parts of SEC-REQ-007: memory only, no cookie, a new exchange per
    launch.
  - WP-21's CSP spike records its result in an ADR that amends ADR-0018, not in ADR-0018 itself (accepted ADRs are
    not edited). WP-21 step 1 and `25` §3.10 were corrected.
- Checks:
  - guard tests RED first (11 failures), then `make ai-hooks-test` → 55 tests OK, and `tooling` CI on #29 passes;
  - a pipe probe of the new hook (Edit under `kvadro.uz` → deny, Read → allowed, `npm run dev` there → deny);
  - a reviewer agent read the four ADRs against 24, 25, the answers and the amended ADRs: no blocker, 8 small
    traceability findings, all fixed before the PRs were opened.
- PR #26 (deps) was merged by the other session. I merged `main` into the WP-00 branch: `make ci-backend` exit 0,
  Pest 92 of 92.

**Not applied:**

- No ADR is accepted.
- The live-session hook probe has not been done: it is only possible after #29 merges.
- The first developer has not yet answered on the PR size or on the deploy cadence (asked in #30).

## K. Development track, 2026-11-14 (night) — WP-01 merges, WP-02

Developer: «#29 слит, проверь хук в живой сессии». GitHub said #29 was still open, so the developer chose «Проверить до
слияния». With #29's guard placed temporarily in the working tree, the live probe on a throwaway `kvadro.uz` folder
gave:

- `Edit` and `Write` refused with the legacy reason;
- `npm` and `svn commit` refused;
- `Read`, `rg` and `cat` allowed.

Then «#29 слит, сливай #32 и бери WP-02»: #29 was still open, and the developer chose «Слить #29, потом #32». Both
were merged with merge commits (`8aa422f`, `6286ef4`), and `main` was merged into the WP-00 branch.

**WP-02 applied** (PR #37, open):

- `KVADRO_ROOT` is set in this machine's `.ai/local.env`; the legacy checkout is in a `local/smart/kvadro.uz` folder.
- The baseline pins `index-DY_DH7h-.js` (SVN r27). It is the third release after the audited one, and it is a new
  feature: the return banner with `GET /api/feed/new` and the radar card in the feed.
- Audit, registers and 24 specifications are brought up to the pin, in three subagent passes. The main session
  reviewed and verified each pass:
  - spot checks in the code (SCR-018, LB-APP-048);
  - every remapped line reference checked by content;
  - `task_graph` fixed by covering F-RADAR-009 and F-RADAR-010 in KV-FE-080.
- Own choices, all listed in #37: the new v1 method `GET /listings/new`; a malformed legacy `count` becomes `503`;
  the banner and the card stay hidden while radars are off (DEC-51).

On «сделай все сам»: the request to the operator was put into an unsent Gmail draft. On 2026-11-15 the developer had it deleted («Удали черновик gmail это не та почта который нужно использовать»); the text stays in the WP-02 specification. It cannot be sent, because only the
product owner knows the operator's contact (Q-SYS-009). The outbound addresses are asked for in #37.

**Not applied:** the request is not sent; WP-02 is not `DONE`.

## L. Development track, 2026-11-15 — WP-03, package list and the pgsql test group

The developer: «бери WP-03». WP-03 depends on WP-01, which is `WAITING` (ADR-0019 `Proposed`, #30 unanswered); the
package list needs the first developer's confirmation anyway (DEC-49), so both can come together.

**Applied** (draft PR #39, branch `feat/wp-03-dependencies-and-test-tooling`):

- Backend `pgsql` test group: `tests/PgsqlTestCase.php` (truncation; skips unless `pgsql` and a `_test` database,
  checked from the environment and from the booted configuration), `concurrently()` in `tests/Pest.php` (unbinds
  each task from the generated Pest class), suite `Pgsql`, CI steps with `--fail-on-skipped`, `make test-pgsql`.
  First members: `ConcurrentlyTest`, `MediaOwnershipRaceTest` (WP-00, KI-25), `Unit/PgsqlGuardTest`. Verified red
  first, then `make test-pgsql` → 3 passed on a local `homi_test`, and `make ci-backend` → exit 0.
- Own choices: `PgsqlTestCase::refusal()` as a static rule with a unit test; the second check in
  `createApplication()`; `PGSQL_TEST_DATABASE` in the Makefile; the local `homi_test` on this machine's Homebrew
  PostgreSQL rather than on the LAN database host of `.env`.
- The package table (31 packages) with licence, release dates, transitive counts and audit is in the PR body. It
  comes from a scratch resolution outside the repository (`pnpm install --lockfile-only --ignore-scripts`).
- The specification was corrected against the registry: `vite` added as Vitest 5's peer; `vite-tsconfig-paths`
  dropped; `oxc` instead of `esbuild`; the real install scripts; peers of `openapi-typescript` and Radix; pnpm 11's
  minimum release age.

**Not applied (at that point):** no npm package was installed; steps 3–9 waited for the confirmation in #39.

**Later the same day.** The developer confirmed the table: «потверждаю». The confirmation is recorded in the PR
description. Steps 3–9 were then applied on the same branch, and PR #39 is out of draft for review:
- **Packages:** the 31 packages are installed at the confirmed versions. The lockfile grew from 417 to 665 entries
  and no existing entry changed. `pnpm audit --prod` found no known vulnerabilities.
- **Install scripts:** all three are denied in `allowBuilds`.
- **Unit tests:** `frontend/vitest.config.mts` defines the projects, and `vitest.setup.ts` rejects every unmocked
  `fetch`. `@homi/testing` has the fake Telegram, the synthetic `initData`, `freezeClock` and `fixture()`; its 89
  self-tests pass under `UTC` and `Asia/Tashkent`.
- **Lint:** the ESLint restriction on `@homi/testing` is in place in the three apps.
- **End to end:** Playwright runs the smoke test and the guard test, both green against the built app and against
  `https://app.homi.loc`.
- **Gates:** `make ci-frontend` now runs the unit tests, and `make e2e` and `frontend-e2e.yml` are new. All three
  workflows were green on the PR.

Own choices, each recorded in the specification's "Design" section:
- the flaky tag uses `skip: true`;
- every `test` script passes `--config`;
- the Vitest configuration is a `.mts` file;
- `@homi/testing` has two entry points, and its guard is an automatic Playwright fixture;
- the double declares no global `Window` type;
- `BackButton` has no version gate, as in TMA-042;
- fixture names take the form `<area>/<name>`.

ASSUMPTION_MISMATCH AM-51 (2026-11-15):
- **Assumption.** The WP-03 vetting, which read a lockfile from a scratch resolution, listed three install scripts in
  the new tree: `@swc/core`, `@parcel/watcher` and `fsevents`. The plan was to allow none of them, without recording
  any decision.
- **What was found.**
  - The first `pnpm add` failed with `ERR_PNPM_IGNORED_BUILDS`, because pnpm 11 has `strictDepBuilds: true` by
    default.
  - It named `core-js` as well (through `posthog-js`).
  - `fsevents` 2.3.3 has no install script; its binary ships in the package.
- **Resolution.** `frontend/pnpm-workspace.yaml` lists the three real scripts in `allowBuilds`, all set to `false`.
  The specification and the PR description were corrected.

## M. Development track, 2026-11-15 — WP-10, API v1 framework

Taken on «бери WP-04». There is no WP-04, and WP-10 is the next package. What it needs from WP-03 (openapi-typescript,
the test runners, the `pgsql` group) is on `main`; WP-03 itself waits only for its deploy. Branch
`feat/wp-10-api-framework`. The corrections are recorded in the specification (rule 6); the facts that the
specification had assumed differently are below.

ASSUMPTION_MISMATCH AM-52 (2026-11-15):
- **Assumption.** The WP-10 specification assumed four things:
  - Scramble documents `sourced()` and `cursorPage()` from the helper bodies as written;
  - the export of `docs/api/openapi.json` is the same on every machine;
  - `git diff --exit-code` catches a missing generated file;
  - two parallel `sources:set` calls are enough to show a lost update.
- **What was found.**
  - Scramble documented `['source' => $source->value] + $meta` as a bare `array`. The plain-iterable branch of
    `cursorPage()` made `data` an `anyOf` with `array`.
  - The server URL comes from `APP_URL`.
  - `git diff` passes an untracked file.
  - Inside a PostgreSQL transaction, Pennant's retry of a lost insert of the default row cannot work, because the
    failed insert aborts the transaction first.
  - The in-process export left the test suite at about 160M, over PHP's 128M default.
- **Resolution.**
  - `sourced()` writes the enum after the spread of `$meta`, and `cursorPage()` takes a `ResourceCollection`.
  - A document transformer names the server relatively.
  - Both checks also run `git ls-files --error-unmatch`.
  - `SourceRuleStore` reads the rule once before its transaction.
  - The race test runs one share and five users and fails without the lock.
  - `phpunit.xml` sets `memory_limit` 512M.

Also found and fixed: `@homi/api-client` threw `ApiError` on every `204` (`DELETE /media/{media}` included). It now
answers `{success: true, data: null}`.

Left as found: Scramble documents the media answers built by `success()` with `message: null` and `meta: string`
(pre-existing), so the generated media types carry them. The typed client reads only `data`.

## N. Development track, 2026-11-15 — WP-11, contract: session, me, settings, reference, cities, events

Taken on «бери WP-11». Branch `feat/wp-11-contract-session-reference`. The seven methods answer on stubs; the
corrections are recorded in the specification (rule 6).

The same day the developer allowed the agent to edit the local environment file until revoked (verbatim quote in
`.ai/memory/session-handoff.md`). The committed deny rule of `.claude/settings.json` still blocks the agent from
writing that file, so the developer adds new local keys with one command.

ASSUMPTION_MISMATCH AM-53 (2026-11-15):
- **Assumption.** The WP-11 specification assumed several things:
  - its examples were legacy vocabulary: the city `samarkand`, the district `yunusabad`, the zone «Центр», daily rent
    presets 20/30/50;
  - fixtures could carry the scenarios `single_city` and `no_bot`;
  - Scramble types an enum from `BackedEnum::from()`, a list from `array_map`, and an object from the `array` rule.
- **What was found.** The audit was read by a subagent; its claims were spot-checked against the cited lines of
  `04`, `06` and `03b`.
  - Samarkand is not a legacy city (`04`). The district codes are the slugs of `03b`. The zone is «Центр (внутри
    кольца)». The bot's daily presets are 30/50/80/120.
  - The bot name is configuration, not fixture data.
  - Scramble typed all three as `string`.
- **Resolution.**
  - The fixtures follow the audit.
  - `single_city` is derived from the default fixture, and `no_bot` is answered by the controller.
  - `Locale`, `Currency` and `Theme` have `fromField()`; the settings presets are built with `foreach`; `props` is
    validated in `after()` and documented with `#[BodyParameter]`.

## O. Development track, 2026-11-15 — WP-12, contract: listings, map, card, contact, translation, share

Taken on «бери WP-12». Branch `feat/wp-12-contract-listings`. The nine listing methods answer on stubs; the
corrections are recorded in the specification (rule 6).

ASSUMPTION_MISMATCH AM-54 (2026-11-15):
- **Assumption.** The WP-12 specification assumed several things:
  - the filter table could say "rent only" for `tenant`;
  - the example district code `yunusabad` is a code of the reference data;
  - the resources would type every listing field once the data objects are typed;
  - `sources:publish-stub-media` of WP-10 already wrote catalogue photos.
- **What was found.**
  - BR-API-029 and BR-APP-003 keep `tenant`, `pets` and `pets_only` for long rent only; "rent only" is DEV-017,
    which stays off.
  - The district codes are the slugs of `03b` (AM-53): `yunusobod`.
  - Scramble types an element of an array property only through a resource with a typed constructor. A docblock on
    the promoted property, an inline `@var` in the loop and a typed `@return` accessor were each tried, and each still
    gave `string`. The counts read through the generic `ResolvedSource` came out as `string` too.
  - The command copied a directory tree as it was.
- **Resolution.**
  - `tenant`, `pets` and `pets_only` are stripped outside long rent.
  - The example uses `yunusobod`.
  - Each item list has a small resource (`MapPointResource`, `PriceEventResource`, …), and the counts are cast to
    `int`.
  - The command writes `stub/<number>/<n>.jpg` and `.s.jpg` for every photo address of the catalogue, from six
    generated placeholders.

## P. Development track, 2026-11-15 — WP-13, contract: personal lists, reports, surveys, radars, landing

Taken on «бери WP-13». Branch `feat/wp-13-contract-personal-radars`. The last 23 methods of `25` §4.2 answer on
stubs. With WP-11 and WP-12, the route list of `/api/v1` (without the media routes of Phase 3) equals the 39 pairs of
the Wave 1 table. The corrections are recorded in the specification (rule 6).

ASSUMPTION_MISMATCH AM-55 (2026-11-15):
- **Assumption.** The WP-13 specification assumed several things:
  - a radar `PATCH` needs no rule for unknown keys;
  - the hidden list has no order;
  - the landing's `area` is always a number;
  - a created radar answers `200` as in legacy;
  - the stub feed of WP-12 may refuse a foreign cursor with `422`.
- **What was found.** A read-only subagent compared the specification with `02`, `03`, `08` and the task rules; its
  citations were checked against the cited lines.
  - `08` API-021 (lines 929, 952) refuses an unknown `PATCH` key with `422`.
  - KV-BE-042 (line 71) orders hidden listings newest first.
  - RES-010 and RES-011 (`08` lines 1439, 1453) give `area: number|null`.
  - Legacy creates with `200` (`08` line 872).
  - WP-42 (line 153) ends a list quietly on a foreign cursor.
  - BR-API-090 lets legacy send `ask_found` on any `PATCH {active}`; KV-BE-104 and the specification keep it for
    pauses.
  - BR-API-151 writes landing times with `Z`; v1 writes `+00:00` everywhere.
- **Resolution.**
  - An unknown `PATCH` key is `422`.
  - Hidden listings are newest first.
  - `area` is nullable.
  - `201` for a created radar is listed among the changes, as are the time form and `ask_found` on pauses only.
  - `StubCursor` ends every stub list quietly on a foreign cursor; the WP-12 note and its test are corrected.

## Q. Development track, 2026-11-15 — WP-20, app foundation: routes, localisation, tokens, themes, brand, base components

Taken on «бери WP-20». Branch `feat/wp-20-app-foundation`. Stage B starts: `frontend/app` has the whole route tree of
`25` §3.2 with placeholders, the locale redirect, next-intl over the new package `@homi/i18n` (the legacy catalogues of
`index-DY_DH7h-.js`, SVN r27, imported without running the legacy files), the legacy look as tokens and themes in
`@homi/ui`, the restyled shadcn/ui base components, the brand layer, the `DEV` flags, the no-op facades and the demo
marker. The "verify before use" items are resolved in the specification (rule 6) and its "Handoff".

ASSUMPTION_MISMATCH AM-56 (2026-11-15):
- **Assumption.** The WP-20 specification assumed several things:
  - the Vitest config is `frontend/vitest.config.ts`, and package tests may live in `tests/`;
  - the build might accept the two slot catch-alls next to `[locale]/[...rest]`;
  - next-intl's middleware could be composed into `proxy.ts` for the locale rule (cookie, else `ru`, never
    `Accept-Language`);
  - a layer leaves the DOM when Back closes it;
  - `notFound()` for an invalid parameter answers `404`;
  - component tests have `@testing-library/jest-dom`.
- **What was found.**
  - The config is `frontend/vitest.config.mts`; its package projects included `src/**` only.
  - `next build` refuses the catch-alls: "Ambiguous route pattern `/[*]/[...*]`".
  - next-intl 4.15.1 detects by `Accept-Language` when `localeDetection` is on and ignores the cookie when it is off;
    its cookie sync also reads `Accept-Language`. It deprecates `setRequestLocale` for `next/root-params`.
  - Next.js 16 with `cacheComponents` hides a page it left in a React `<Activity>` (`preserving-ui-state.md`); the
    closed sheet is in the DOM, hidden.
  - A parameter is runtime data, so `notFound()` runs after the static shell has started streaming: the not-found
    placeholder renders with status `200` (`not-found.md`). Unknown addresses still answer `404`.
  - `@testing-library/jest-dom` is not installed (WP-03).
  - A plain `kvadro` brand pattern would match the legacy key name `found.kvadro`, which later code must call.
- **Resolution.**
  - Package projects include `src/**` and `tests/**`.
  - All three catch-alls are `[...rest]`; the not-found page is `(main)/[...rest]/page.tsx` (the specification's
    default).
  - `proxy.ts` owns the redirect in a twelve-line `withLocale`; next-intl reads the locale from `next/root-params`.
    Pages keep their static shell (the build lists them `○`).
  - End-to-end checks test visibility, not presence; WP-21 and WP-23 are told in the "Handoff".
  - The `200` for invalid parameters is recorded; no `generateStaticParams` is added for `number`, `id` or `kind`.
  - Component tests assert DOM attributes; no dependency is added.
  - `brand-words.json` lists the brand forms (`kvadro²`, `KvadroApp`, hosts, handles, the Cyrillic name), not the
    bare word.

## R. Development track, 2026-11-15 — WP-21, Telegram layer and session

Taken on «бери WP-21». Branch `feat/wp-21-telegram-and-session`. The Mini App now starts inside Telegram: the boot
script with «Обновите Telegram», the adapter `tg` (the only reader of `window.Telegram`), the session exchange through
`/bff/session` in cookie or header mode, BackButton and SettingsButton on the app's own history stack, launch links,
the locale guard, and a nonce CSP from `proxy.ts`. The spike of step 1 chose nonces with request-time documents
(ADR-0020, its own PR). The specification is corrected where the code differs (rule 6) and its "Handoff" is filled.

ASSUMPTION_MISMATCH AM-57 (2026-11-15):
- **Assumption.** `25` §3.1 and the WP-21 specification assumed:
  - a nonce-based CSP can live with the static shell of `cacheComponents`;
  - a plain `<script async>` of the root layout keeps its place in `<head>`;
  - `MeResource` tells which Telegram user a cookie belongs to;
  - `history.replaceState(history.state, …)` removes the launch fragment for good;
  - two history changes in one tick are two entries.
- **What was found.**
  - The static shell is prerendered without a request: none of its 23 script tags carries the nonce and the browser
    blocks all of them. With the root layout reading `x-nonce` (and `instant = false`) all 31 carry it; documents
    become `ƒ`, and an unknown address answers `200` with the not-found screen and `noindex` instead of `404`.
  - React 19 hoists an `async` `<script src>` above the inline scripts of `<head>`.
  - `MeResource` has no Telegram id.
  - The App Router's patched `replaceState` ignores an address under a state that carries its `__NA` marker, and the
    fragment came back on the next Back; it also came back on the locale switch after sign-in.
  - A native `replaceState` followed by a router push in the same tick left one history entry.
  - `restoreFromDeviceStorage` cannot run in parallel with the SDK wait: DeviceStorage is part of the SDK.
- **Resolution.**
  - ADR-0020: every document renders at request time; the WP-20 end-to-end 404 case now checks the not-found screen
    with `noindex`.
  - The boot script inserts the SDK tag after its watchdog listens.
  - `homi_session_user` holds the SHA-256 of the Telegram user id; `GET /bff/session` returns it.
  - `scrubLaunchFragment` passes `null`; `FragmentGuard` removes the fragment after every navigation.
  - The launch redirect replaces first and pushes once the router shows the cleaned address.
  - The restore runs right after the SDK wait.

## S. Development track, 2026-11-15 — WP-22, data layer, formatters and the filter model

Taken on «бери WP-22». Branch `feat/wp-22-data-layer`. A screen now gets its data and rules from one place: typed
server calls with the session (`lib/api/server.ts`), the read pass-through `/bff/*` with its allow-list and
`bffFetch` for header mode, `runAction` / `useAction` for Server Actions, `useResource`, one mapping from API answers
to `UiError`, the cached reference data, the formatters `@homi/i18n/format` and the new package `@homi/search` with
the address mapping. `@homi/search` and `@homi/i18n/format` were written by two subagents in parallel and
spot-checked here (contract names against `docs/api/openapi.json`, money rounding, imports). The specification is
corrected where the code differs (rule 6) and its "Handoff" is filled.

ASSUMPTION_MISMATCH AM-58 (2026-11-15):
- **Assumption.** The WP-22 specification ("Reference data", build time) assumed `next build` prerenders the
  reference calls and so calls the API once per locale, with no API in the `Build` step of CI.
- **What was found.** Since ADR-0020 every document of the app renders at request time (all routes `ƒ`), so the
  build makes no reference call: `API_URL=http://127.0.0.1:9/api/v1 pnpm --filter app build` → exit 0. The first
  request fills the cache entry; with the API unreachable the page still answers `200` and the empty reference stands
  in with the `seconds` profile.
- **Resolution.** The fallback of the specification is kept (it protects the first request); the specification says
  that the build makes no call. A count of the app server's API calls behind a counting proxy showed `GET /reference`
  and `GET /cities` once per locale over eight page loads in three locales, and `GET /me` and `GET /listings/count`
  once per request with a session (four loads, four calls each) — only the reference is cached.

Merged on 2026-11-16 as #61 (`e8c8f9e`) after green `frontend` and `frontend-e2e`; `WAITING` for the deploy.

Own choices (no ADR): `ApiResult` failures carry `method` and `path` besides `error`, `status` and `code`;
`ReferenceProvider` feeds a client store next to the page instead of wrapping it; the request id waits for `io()`;
the feed and map placeholders show the proof of step 13 until WP-24 and WP-27.

## T. Development track, 2026-11-16 — pull onto the developer's machine, dev-check and nginx fixes

Started on «получи последную версию проекта с гит», continued on «да сделай все сам», «да давай сделаем граомтно» and
«конечно сделай чтобы все граомтно работало», closed on «сохрани сессию и commit push main сделай сво изминение»
(read as on 2026-11-16 before: into `main` through PRs with merge commits, never a direct push).

Applied:
- `main` pulled twice (`3bf4f39` → `19048b4` → `a86a41c`); `composer install`, `pnpm install`, two migrations; the
  developer added the new env keys, because the guard hook blocks shell writes to `.env*`.
- #63 (`d92f318`, KI-30, resolved): `make dev-check` reported `https://app.homi.loc/ → 307` on a healthy stack after
  WP-20's locale redirect; `check.sh` now follows redirects on the same host.
- #64 (`59a34ad`, KI-31): the shared nginx lost `~/Documents` access after a reload, and `nginx.sh stop` + `start`
  left it down (a graceful quit that did not finish, then a HUP the quitting master ignored). `nginx.sh` got separate
  `start`/`stop`/`restart`, a TERM fallback, root-only signalling and the "Operation not permitted" diagnosis;
  `make dev-nginx-restart`.
- Both merged without the first developer's review on the developer's instruction. #64 was stacked on #63; deleting
  #63's branch closed #64, which was reopened and retargeted to `main`.

Own choices (no ADR): signals go to the root master's pid (`kill -QUIT/-TERM`) instead of `nginx -s`, which depends
on the pid file; 10 s before TERM; the stub harness used for the 15 scenarios stayed in the session scratchpad
(no test runner exists for `scripts/dev`, and no CI covers it).

Verified: `make dev-check` → `dev:check OK (0 warning(s))`, 24 PASS, on `main` = `59a34ad`.

Afterwards, on «да сделай, и сразу commit push main»: the smartagent.uz session reported that Grok drops five of
the six project agents. Their `description` held an unquoted ": ", which is invalid as strict YAML. The descriptions
are now double-quoted, and `.ai/agents/README.md` states the rule. Verified: Symfony YAML parses all six, and every
`description` equals the old text; `grok inspect --json` lists 1 project agent before and 6 after.

## U. Development track, 2026-11-16 — WP-23, gates and shell

Taken on «Погнали WP-23». Branch `feat/wp-23-gates-and-shell`. The `composer update` found in the working tree
(«это я») went first into its own PR #67 («да, сделай отдельный PR для composer.lock»), merged on «сливай #67»
(`7792c67`); the branch starts there. Each part ran as its own ultracode workflow and is its own commit: A (`@homi/ui`
primitives and the gallery), B (toast, feedback, confirm, the route wrappers), C (the shell), D1 (the settings
action, the gate machinery, the boot retry, the error screens), D2 (the four gate screens, `CityList`,
`nearestCity`). The specification is corrected where the code differs (rule 6) and its "Handoff" is filled.

The Mini App now has its frame. `@homi/ui` adds the shell primitives (`BottomSheet` with drag, `SubPageFrame` with
swipe back, `FilterChip`, `HeaderChip`, `SegmentedControl`, `ChoiceList`, `EmptyState`, `ErrorState`, the icons),
shown by the gallery at `/dev/ui` in `local`, `ci` and `staging` builds. The app has the toast store and host,
`feedback`, `confirmText`, the route wrappers `RouteSheet`, `RouteOverlay` and `SubPage`, and `AppShell` with the
top-bar variants, the tab bar, the list/map toggle, the collapsing chrome with its one-line title and pull-to-refresh.
`GateRedirector` sends every launch through the gate table (`resolveGate`) and runs the boot retry; the gate screens
are `/outside`, `/no-access`, `/welcome/language` and `/welcome/city`; an expired session, a render error, an unknown
address and a failed root layout have their screens; `updateSettings` is the first Server Action. The screens behind
the tabs are still placeholders.

ASSUMPTION_MISMATCH AM-59 (2026-11-16):
- **Assumption.** WP-20 and AM-57 assumed the catch-all `(main)/[...rest]/page.tsx`, which calls `notFound()`,
  renders the not-found screen inside the normal document of the root layout; WP-23's checklist line «An unknown
  address inside the app shows «Такой страницы нет»» builds on it.
- **What was found.** Thrown with no `<Suspense>` boundary above the page, `notFound()` makes Next.js 16.4.5 serve
  its `<html id="__next_error__">` shell, which the client renders with `createRoot`. React does not run inline
  scripts it creates, so the boot script and the stubs of `<head>` never run and the SDK tag is never inserted:
  inside Telegram the page has no `window.Telegram`, the session goes `outside`, and with `GateRedirector` a hard load
  of `/ru/unknown` ended on `/outside`. A build with the root layout and not-found page from before part D1 showed
  the same shell, so the defect predates the gates; the end-to-end tests passed because the fake Telegram is an init
  script. `/ru/listing/abc`, whose `notFound()` runs under `<Suspense>`, kept the normal document.
- **Resolution.** The catch-all throws from an async child under `<Suspense fallback={null}>`, as the parameter
  placeholders do. `/ru/unknown`, `/en/listing` and `/uz/settings/nope` answer `200` with `id="homi-boot"`,
  `noindex` and `<template data-dgst="NEXT_HTTP_ERROR_FALLBACK;404">` (curl on a production build);
  `foundation.spec.ts` asserts it at request level. The client head then holds two identical `noindex` tags (one
  inserted by the server, one by the not-found boundary), as `/ru/listing/abc` already did; the test checks that
  every robots tag says `noindex`.

ASSUMPTION_MISMATCH AM-60 (2026-11-16):
- **Assumption.** The Next.js 16.4 guide `03-architecture/accessibility.md` (required reading before Next.js code)
  says client-side transitions are announced by the route announcer, which reads `document.title`, then the `<h1>`,
  then the path. The WP-23 specification asks nothing more of the screens that replace the route.
- **What was found.** `app-router-announcer.js` reads the `<h1>` only while `document.title` is empty and speaks only
  when the text changes; the app's title is the constant `brand.name` (`app/[locale]/layout.tsx`), so
  `GateRedirector`'s replace into a gate is silent. `layout-router.js` leaves focus untouched on a navigation
  ("resetting focus on navigation is deferred"), and with `cacheComponents` the page that held the focus is hidden.
- **Resolution.** The headings of `/no-access`, `/welcome/language` and `/welcome/city` (`tabIndex=-1`) take the focus
  when their view first shows; `SessionExpiredScreen` focuses «Закрыть» and `CrashScreen` «Обновить» on mount. The
  `/outside` sentence, the crash and not-found titles and the expired sentence are `h1` elements (`EmptyState` got
  `titleAs`). The language buttons are a `role="group"` named by the heading; busy buttons and the locate row use
  `aria-disabled`, so the tapped control keeps the focus. `RouteOverlay` and `SubPage` still move no focus: a KI
  candidate for WP-26, WP-31 and WP-33.

ASSUMPTION_MISMATCH AM-61 (2026-11-16):
- **Assumption.** The WP-23 specification ("Tests") runs every end-to-end spec in cookie mode and header mode.
- **What was found.** Every end-to-end sign-in is the one stub user, and the `api` limiter allows 120 requests per
  minute per actor (`AppServiceProvider::configureRateLimiting`). A full local `miniapp` run with one worker sits at
  the limit (110–138 `/api/v1` requests per minute in the nginx log, 183 in one minute of a D2 run); a `429` on `/me`
  makes `/bff/session` answer `502`, and the session stays `booting`. Doubling every shell test pushed the full
  local run over the limit. In header mode `launchApp` answers `/bff/session` itself in front of any route a spec
  registers before the launch, so a refusal at launch cannot be staged there, and a sign-in refused at launch never
  reaches a session mode anyway. CI starts the API with `CACHE_STORE=array` under PHP's built-in server, so its
  limiter does not accumulate between requests.
- **Resolution.** Every spec runs in cookie mode; header mode repeats the tests that hold the session across soft
  navigations or carry the token: in `shell.spec.ts` the tab round trip, the pull and the sheet closed four ways; in
  `gates.spec.ts` the first-launch pick through the Server Action (the token in the action's arguments, no
  `homi_session` cookie) and the expired screen (made mid-session: a read answers `401`, the re-sign-in
  `auth_expired`); `crash.spec.ts` runs ru and uz in both modes. The local limit is a KI candidate for the follow-up
  docs PR.

ASSUMPTION_MISMATCH AM-62 (2026-11-16):
- **Assumption.** `25` §3.6 turns the legacy spacing into Tailwind 4 tokens; WP-20 kept the legacy root font
  `15px/1.4` (`packages/ui/src/styles/layout.css`) next to Tailwind's default spacing scale.
- **What was found.** Tailwind's spacing step is `0.25rem`, 3.75 px under a 15 px root, so every rem utility is
  6.25 % small: `h-11` is 41.25 px, `h-9` 33.75, `size-10` 37.5, `px-4` 15. The view toggle's collapse (27 px origin,
  49 px clip) needs exact pixels, and the language picker's globe circle measured 60 px instead of 64.
- **Resolution.** The shell, `NoAccessScreen` and `LanguagePicker` spell the legacy pixels of the legacy CSS
  (`h-[44px]`, `gap-[8px]`, …). The primitives of WP-20 and part A (Button `size-10`, `SegmentedControl` `h-9`,
  `Chip` `h-9`/`px-3.5`, their gaps and paddings) and the city page keep rem classes. The one-line fix, `--spacing:
  4px` in `@theme`, grows every primitive to its legacy size and needs the gallery checked: a reviewer question and
  a KI candidate.

ASSUMPTION_MISMATCH AM-63 (2026-11-16):
- **Assumption.** The WP-23 specification takes the no-access source from WP-21's parser: `web`, a campaign code,
  `seo` or `share`, with `l_123-fb12` among the main-button cases. WP-21's table maps `l_<n>-(fb|tg|ig)<1–4 digits>`
  to that code; KV-FE-042 expects `s_fb12--l123` for `l_123-fb12`, and `04` BOT-031 reads the source as
  `fb12`/`tg3`/`ig5`.
- **What was found.** `sourceOf()` in `lib/deeplinks/parse.ts` returned only the prefix (`fb`), and
  `tests/deeplinks/parse.test.ts` pinned `fb`/`tg`/`ig`, so «Перейти в бота» would carry `s_fb--l123` and the bot
  would lose the campaign. It also read any `-seo…` as `seo`: `l_123-seoul_flats-45` gave `seo` where KV-FE-037 gives
  `share`. `source` is read only by `features/gates/accessReason.ts`.
- **Resolution.** Fixed here: the whole code (`fb12`), and `seo` only for `-seo` followed by `-` or the end.
  `parse.test.ts` pins `fb12`, `tg7`, `ig1234` and the `seoul_flats` row; `accessReason.test.ts` expects
  `s_fb12--l123`.

ASSUMPTION_MISMATCH AM-64 (2026-11-16):
- **Assumption.** The WP-23 specification ends a location request on the city page by "failure or the 12 s timeout
  of WP-21"; WP-21's `lib/telegram/location.ts` says the whole request never takes longer than 12 s (TMA-035).
- **What was found.** The LocationManager path has its own 12 s timer, but the browser path (`viaBrowser()`) passes
  the limit only as `timeout` to `getCurrentPosition`, which does not count the time the permission prompt is open:
  a browser request can stay pending indefinitely.
- **Resolution.** `CityList` races `tg.location.get()` against its own 12 s timer (`LOCATION_TIMEOUT_MS`); WP-25's
  city sheet reuses `CityList`. The adapter bounding its own promise is a KI candidate for the follow-up docs PR.

Merged on 2026-11-16 as #68 (`901eaad`) after green `frontend` and `frontend-e2e` (85 passed); `WAITING` for the
deploy and the checks inside Telegram on staging. KI-32 … KI-43 record the known-issue candidates.

Own choices (no ADR): `ToastHost` is a plain `role="status"` live region, not Radix Toast, which pauses on blur,
pointer movement and focus and defaults to 5 s (D-T-1); the boot retry makes six attempts and shows `ErrorState`
after the sixth failure (D-S-3); `GateRedirector` owns every navigation into and out of a gate, and the pickers never
navigate (D-S-6); `launchPending()` waits until the address shows the launch target, not for `history.length` to grow
(the first D1 version: Chromium caps it at 50, and Telegram Web's iframe shares the tab's history); a layer opened
over a page keeps that page's chrome (`isLayerAddress`, `useDrawnVariant`); swipe back is touch-only; SettingsButton
shows only while the session is `ready` and the address is not a gate (D-S-15); the first-launch city save is not
awaited (legacy); `RefreshProof` gives the feed's pull a handler until WP-24.

Verified (on `fb4a2b2`, from `frontend/`): `pnpm --filter @homi/ui test` → 8 files, 111 tests passed;
`pnpm --filter @homi/i18n test` → 10 files, 109 passed; `pnpm --filter app test` → 81 files, 977 passed;
`pnpm -r lint` and `pnpm -r typecheck` → exit 0. `env -u CI pnpm exec playwright test --project=miniapp --workers=1`
(85 tests, local API on stubs, 18:49–18:51) → 82 passed, 3 failed: `shell.spec.ts:319`, `:330` and `:365`, each
waiting for `data-session="ready"`; the nginx API log shows `429` on `GET /api/v1/me` and `/api/v1/listings/count`
at 18:51:22–18:51:35 and 122 `/api/v1` requests in the minute 18:50 (AM-61). `shell.spec.ts` alone at 18:52 → 16
passed (51.3 s). The D2 integrator's second full run, before the D2 review fixes → 85 passed (2.2 min), no `429` in
that window; the D2 verifier's full run, after them → 84 passed, 1 failed (`shell.spec.ts:319` on `429`s), the file
alone → 16 passed. The `✘` on `smoke.spec.ts:25` is its expected `test.fail`. `make ci-frontend` (from the root)
→ exit 0 (tests: app 977, `@homi/search` 238 + 1 todo, `@homi/ui` 111, `@homi/i18n` 109, `@homi/testing` 95,
`@homi/api-client` 14, `@homi/utils` 2).

## V. Development track, 2026-11-16/17 — WP-24, feed and listing card

Taken on «Погнали WP-24» and continued on «давай, продолжай». Branch `feat/wp-24-feed`, on `main` = `d76a0c0` (after
#69); its first commit `f9cc818` marks the package `IN_PROGRESS`. Each part ran as its own ultracode workflow and is
its own commit: A `8b64b19` (the card rules, `Photo` and `PhotoStrip`, `ListingCard`, `FavButton` with
`setFavorite`, the preview cache, the gallery's card states), the contract fix `9163d26` (AM-65), B `1d1c964`
(`useCursorFeed`, `ListingFeed`, the header chips, the few-results and empty states, the radar seam, `FeedServer`,
`FeedScreen`, the page) and C `f58cf88` (`e2e/feed.spec.ts`, `stubMedia`, the CI variable). The specification is
corrected where the code differs (rule 6) and its "Handoff" is filled.

The search tab now shows the feed. With the session cookie `FeedServer` reads page one on the server (on an address
without a city for the profile's city, read from `/me` first), and `ListingFeed` adopts it without a request; header
mode and a first launch read page one in the browser; `useCursorFeed` pages through `/bff/listings` (20 a page, the
sentinel 800 px ahead, every listing once). The card — full and compact, the photo strip with the small variant and
the server's Save-Data / Telegram-Android hint, the badge, verdict, price, facts and location rules, the heart saving
through `setFavorite` — records `seen` and the preview cache when opened. The chips sit in the top bar and push the
WP-20 sheet placeholders with the search state; the few-results note, the empty states of the three lists, the
loading and error states of SCR-008 with a status line for screen readers, pull-to-refresh and the inline slot of
WP-30's radar card are built, and the radar button stays hidden behind `radarsReady`. The feed keeps its own search
under a layer, a sheet or another tab (`useScreenSearchState`, the feed's fix of KI-43), the router refreshes only
after a sign-in of the launch, and the saved city is read hydration-safe.

ASSUMPTION_MISMATCH AM-65 (2026-11-16):
- **Assumption.** WP-12's contract ends the feed on `meta.next_cursor: null` (`string | null`, DEC-41), and WP-24's
  step 1 takes the generated types of `GET /listings` to say so, as those of `/favorites` and `/history` do.
- **What was found.** `operations["v1.listings.index"]` of `@homi/types` typed `meta.next_cursor` as `string`:
  Scramble inferred the source's cursor as a plain string, although `ApiController::cursorPage()` and
  `ListingPage::$nextCursor` take `?string`. A PHPDoc `@var ListingPage $page` and a `@param string|null` on
  `ListingPage` changed nothing; a remark in the method's PHPDoc would be copied into the operation's description
  (and the comment of `@homi/types`). `useCursorFeed`'s comparison with `null` would not have compiled (TS2367).
- **Resolution.** `9163d26`: `$nextCursor = $page->nextCursor ?? null` in a typed local of
  `ListingController::index()`, with a one-line comment; `docs/api/openapi.json` and `@homi/types` regenerated. On
  that commit `php artisan test --compact` → 720 passed, 4 skipped, and `pnpm types:check` → exit 0.

ASSUMPTION_MISMATCH AM-66 (2026-11-16):
- **Assumption.** `25` §3.4 step 5 ("The router refreshes") and WP-21's step 5 refresh the router once per launch in
  cookie mode "so Server Components render with the session"; `SessionProvider` refreshed once, at the first
  cookie-mode `ready` of every launch, whether the launch signed in or only confirmed the document's cookie.
- **What was found.** A launch whose document already carried the launch user's cookie (a reload, a later launch)
  had been rendered with the session, so the refresh re-ran `FeedServer` (`/me` and `GET /listings`) for nothing:
  `useCursorFeed` adopts `initial` only when a key's list starts, and adopting a later one would silently replace a
  page the user may be scrolling — a tab tapped back to the list re-reads the dynamic page as well
  (`segment-cache/bfcache.js` skips the stale check only for Back and Forward, and `DYNAMIC_STALETIME_MS` is 0). A
  launch that signs in — the first one, a revoked cookie, another Telegram user's cookie on the same device — kept
  the page one read with the old cookie: a revoked token showed «Не загрузилось» until a tap, another user's page one
  kept that user's hearts and eyes.
- **Resolution.** `SessionState.renewed` is set when the bootstrap's `run()` signs in and never cleared;
  `SessionProvider` refreshes only when `ready`, cookie mode and `renewed`; `useCursorFeed` reads a page one adopted
  before `ready` again through `/bff` when `renewed`; `readFirstPage` returns `initial = null` on `unauthorized`.
  `provider.test.tsx` covers a sign-in (one refresh) and a confirmed cookie (none); `feed.spec.ts` checks one `/bff`
  page one and one refresh on a first launch, and neither after a reload. `25` §3.4 and WP-21 step 5 now say so.
  What remains — one server read dropped per sign-in launch, the other user's hearts in the HTML until `ready` — are
  KI candidates.

ASSUMPTION_MISMATCH AM-67 (2026-11-16):
- **Assumption.** WP-22's `useSearchState` takes the city of an address without one from `me.city`, else the saved
  `homi-city`, else Tashkent (BR-APP-010), and WP-22 adopts a server `initial` "only when the keys of server and
  client agree"; the WP-24 specification had `FeedServer` read page one for the city of the profile.
- **What was found.** In the server render of a Client Component `useSession().me` is `null` and there is no
  storage, so the HTML lists Tashkent, while the hydration render read `homi-city` synchronously during render. The
  first `FeedServer` read page one for `me.city`: for a profile outside Tashkent the HTML had skeletons and hydration
  adopted cards; for a Tashkent profile with another saved city (changed elsewhere, or a first-launch pick whose save
  failed) the HTML had 20 cards and the hydration render skeletons, a recoverable hydration error after which React
  rendered the boundary again on the client. The parity test always saved the profile's city.
- **Resolution.** `useSearchState` reads the saved city through `useSyncExternalStore` with a server snapshot of
  `null` (`subscribeStorage` of `lib/storage.ts`) and takes `profileCity`, the city `readFirstPage` read from `/me`
  on an address without one, as the profile until `me` is known. `FeedScreen.test.tsx` hydrates the real
  `readFirstPage` HTML in six cases (profile and saved city equal, different or missing; an address with a city)
  without a recoverable error; a `useSearchState` test hydrates with a saved Samarkand. The chips, the mini title and
  the title tabs get no `profileCity` and change their text after hydration on such an address: a KI candidate.

ASSUMPTION_MISMATCH AM-68 (2026-11-16):
- **Assumption.** WP-24's "Loading and errors" said that with `dev001AnyForbiddenShowsAccess` on a `forbidden`
  answer never reaches the list, because the error mapper of WP-22 sends the user to the no-access screen (row 6 of
  WP-22's table).
- **What was found.** Row 6 describes what screens do. `onForbidden()` of `lib/session/bootstrap.ts` is called by
  `useResource` only; `lib/api/errors.ts` maps the answer to `forbidden`, and `bffFetch` returns it. A cursor list
  read through `bffFetch` would have kept the inline «Нет доступа — повторить» with the flag on.
- **Resolution.** `useCursorFeed` calls `onForbidden()` itself when a page is `forbidden`, the flag is on (its
  `flags` option defaults to `devFlags`, as `useResource`'s) and the session is ready; a forbidden `initial` waits
  for `ready`, because `onForbidden()` acts only then. Two unit tests cover it; every `DEV` flag stays off, so no
  end-to-end test reaches the branch.

ASSUMPTION_MISMATCH AM-69 (2026-11-16):
- **Assumption.** WP-20's `lite.css` gave every lite card `contain-intrinsic-size: auto 420px`, the estimate that
  `03` §3.6 records for the feed cards (line 1757).
- **What was found.** The pinned release's CSS has a lite rule of its own, `.lite .lc:not(.compact)`, at 360 px;
  420 px is the size outside lite.
- **Resolution.** `lite.css` uses `auto 360px` with a comment, `packages/ui/tests/tokens.test.ts` pins it, and the
  specification states both sizes. Adding the lite rule to the audit is a reviewer question.

Merged on 2026-11-17 as #71 (`780aea9`) after green `frontend`, `frontend-e2e` (104 passed) and `backend`; `WAITING`
for the photo check and the deploy of the production track and the checks inside Telegram on staging. KI-44 … KI-53
record the known-issue candidates; KI-32 and KI-43 are updated, and KI-29 is resolved by #70.

Own choices (no ADR): a screen reads the search of its own address through `useScreenSearchState`, held under a
layer, a sheet or another tab (D1); `feedQuery.ts` builds the query and the list key for the server and the browser
from the canonical `toSearchParams` (D2); an adopted page one renders on the server and at hydration whatever the
session status, `enabled` gating sending only (D3); the device rule lives in `lib/device.ts`, so `FeedServer` can
compute the small-photo hint, which seeds only the server and hydration renders of `Photo` (D4); any cursor already
sent ends a list; the refresh version is per search; the inline block is one keyed row among the cards; a list
reports its `meta.source` only on its own address; the heart is a sibling of the card's link, with a busy set per
listing and no error haptic; eager photos are not faded, so a server-rendered photo shows before hydration (legacy
faded every photo); the dots count `photos.preview`; the few-results deal switch is one replace, as the title tabs;
`feed.loading` is the one new `homi` key; `FeedScreen` starts the lite scroll measurement on the first scroll; the
end-to-end photos are answered by `stubMedia`, and `frontend-e2e.yml` sets `NEXT_PUBLIC_CDN_URL` so the CSP allows
them.

Verified (on `1d1c964`, from `frontend/`): `pnpm --filter app test` → 102 files, 1402 tests passed;
`pnpm --filter @homi/i18n test` → 10 files, 110 passed; `pnpm --filter @homi/ui test` → 8 files, 112 passed;
`pnpm -r lint`, `pnpm -r typecheck`, `pnpm types:check` and `pnpm --filter app build` → exit 0. Backend on `9163d26`:
`php artisan test --compact` → 720 passed, 4 skipped; PHPStan on the controller → 0 errors; Pint passed. On `f58cf88`:
`make ci-frontend` (orchestrator) → exit 0: types:check, lint, typecheck and every build clean; unit tests app 102
files / 1402, `@homi/search` 238 + 1 todo, `@homi/testing` 95, `@homi/ui` 112, `@homi/i18n` 110, `@homi/api-client`
14, `@homi/utils` 2 passed; `feed.spec.ts` alone → 19 passed, `csp.spec.ts` and `smoke.spec.ts` → 4 passed (the smoke
test of a telegram.org request is an expected `test.fail`), no `429` in those runs (orchestrator). The part C verify
run took every file of `app/e2e/` alone on the same tree: data 5, back 11, boot-failure 6, crash 4, csp 2, feed 19
(three runs), foundation 19, gates 8, launch 5, session 7, smoke 2 passed; shell 15 of 16 on the first try with three
`429`s (KI-32), 16 passed when rerun alone a minute later. Screenshots at 390 px in ru, uz and en, light and dark,
were looked at locally and are not committed.

Work given to Grok in parallel, on the developer's choice («давай 1 и 3»), each in its own worktree from `origin/main`
with a written brief (no servers, no e2e, no files of this branch): KI-29 as PR #70 (the workspace packages are
linted with the app's rules; reviewed here — a probe error fails the lint, and this branch's package files pass
it), merged on «сливай #70» (`d2a4722`) and merged into this branch (`5fd06c9`; `pnpm -r lint` then lints 8
packages, exit 0); and a read-only audit of the WP-25 … WP-33 specifications against `1d1c964`, whose findings
for this PR were applied (rule 6) and whose findings for later packages are listed in the WP-24 Handoff. Next
for Grok, on «да, подготовь промты для 1–3 и 4»: KI-38, KI-39, KI-40 and KI-28, one PR each. The WP-24 PR is
#71.

Merged on 2026-11-17 as #71 (`780aea9`); its follow-up docs PR #76 (`157790d`). Grok's four PRs were reviewed
here and merged on the developer's word, one «сливай #N» each:
- #72 (KI-38, `265f475`);
- #73 (KI-28, `4041d4c`);
- #74 (KI-39, `c390374`);
- #75 (KI-40, `11c75b2`).

The review merged them in pairs onto `780aea9`:
- **#72 and #73.** `php artisan test --compact` → 725 passed, 4 skipped. Pint and `composer types:check` passed.
- **#74 and #75.** The app's Vitest project → 102 files, 1407 tests passed. ESLint on the changed files and
  `next typegen` + `tsc --noEmit` were clean.
- **The fix reverted (probe).** With each fix reverted, its new tests fail: #72 1, #73 2, #74 3 (plus two later
  tests on the stuck promise), #75 1.
- **Security review.** It approved #72 (only the error shape changes) and approved #73 with follow-ups. KI-28
  stays open for the tmp bucket's size bound and the replace race between the size check and the read (a presigned
  POST with `content-length-range` closes both).

The 12 s bound of #75 was raised before its merge: a slower listing push on a first launch meets the city gate.
It is recorded in KI-40. KI-38, KI-39 and KI-40 are resolved.
Their follow-up docs PR #77 merged on 2026-11-17 (`a4c388c`). Session end: WP-25 and the open questions wait for
the developer.

## W. Development track, 2026-11-17 — WP-25, filters, quick filter, sort and city

Taken on «Погнали WP-25». Branch `wp-25-filters`, on `main` = `4f91f8a` (after #78). The package is `c41d07c`; the
review fixes are `37ffd27`. It ran as plain subagents, at most three at a time, each owning its own files:
- **Wave 1:** the logic (`useDraft`, `applyFilters`, `useLiveStats`, `useCityPick`, `refreshCitiesStats`),
  sections 1–6 with `RoomsPicker` and the sort sheet, and sections 7–16 with `newFeatures`.
- **Wave 2:** the full sheet, the quick sheet and the city sheet, then the two end-to-end specs.

The orchestrator wrote `IntInput`, `PriceInput` and the section frame, and re-ran every part's tests itself. Two
independent read-only reviews followed (behaviour and React/Next; security), and their fixes are `37ffd27`. The
specification is corrected where the code differs (rule 6), and its "Handoff" is filled.

The four sheet addresses now render the real sheets, both intercepted over the feed and on a direct load:
- **Full sheet:** `FiltersForm`, with the seventeen stateless sections over `sectionsFor`, the live count and flow
  (`useLiveStats`), the relax chips, the radar seam (off), the nested city picker on `pick=city`, the pets entry and
  the draw hand-off.
- **Quick sheets:** `QuickFilterForm`, whose server `QuickFilterPage` renders the not-found screen for an unknown
  kind.
- **Sort sheet:** `SortList`, an own radiogroup.
- **City sheet:** `CityPickerSheet`, over WP-23's `CityList`.

Every apply goes through `applyFilters`, a back step and then a replace, so history does not grow. The forms are
keyed by `formKey`, so each open starts from the address, and the draft survives the nested picker (proven by
`city.spec.ts`).

ASSUMPTION_MISMATCH AM-70 (2026-11-17):
- **Assumption.** WP-25's "Data" said: "On opening the full sheet: `useCityStats().refetch()`, errors ignored".
- **What was found.** WP-22's `useCityStats(code)` returns the statistics of one city from the reference store. It
  fetches nothing and has no `refetch`. The statistics arrive once, with the reference data of the server render
  (`lib/reference/server.ts`).
- **Resolution.** `refreshCitiesStats()` in `lib/reference/useReference.ts` reads `GET /cities` again through
  `bffFetch`. It replaces only the statistics, ignores a failed or malformed answer, shares one request between
  opens close together, and never rejects. `FiltersSheetRoute` calls it once per mount. The specification names it.

Review findings and fixes (`37ffd27`):
- **Behaviour review:**
  - C-1: `bffFetch` used `AbortSignal.any`, which the engines the boot test admits (Chrome 111–115, Safari
    16.4–17.3) lack, so every read with a signal threw. This is WP-22 code, and the feed's next pages were affected
    too. KI-55, resolved by `anySignal()`.
  - C-3: the quick sheet's key on an address without `city`.
  - P-2: double taps on a sort row and on «Обвести на карте».
  - P-3: a double tap on the city field.
  - P-4: the JSDoc of the listeners.
  - Not fixed: C-2, a rise of the sheet on a city-less address, joins KI-54. P-1, a stale `back()` after a
    subscribe, waits for WP-30.
- **Security review:** all six requirements were met.
  - S-1: only a city of the reference data is saved.
  - S-2: `GET /cities` keeps only elements with a code, both in the browser and on the server.
  - Info: S-3 and S-4 (the relax code is WP-30's to validate).

Own choices (no ADR):
- **Sheet ownership:** each form owns its `RouteSheet`, and `formKey` keys both drafts.
- **Haptics:** they follow legacy (no section plays one; opening plays nothing).
- **Saving the city:** `useSaveCity` calls `patchMe` with the saved city.
- **Live stats:** a change is a change of the count query, and a failed request keeps the previous count and flow.
- **Guards:**
  - one apply in flight;
  - once per showing for the sort pick, the city pick and the draw hand-off;
  - one `pick=city` push.
- **Reused as is:** `CityList` (WP-23), with its own flags default.

Verified (from `frontend/`):
- **On `c41d07c`:**
  - `make ci-frontend` → exit 0. Unit tests: app 118 files / 1713, `@homi/search` 238 + 1 todo, `@homi/testing` 95,
    `@homi/ui` 120, `@homi/i18n` 110, `@homi/api-client` 14, `@homi/utils` 2.
  - End to end, each file alone against a local `next start`: foundation 19, back + launch 16, feed 19, city 6 and
    filters 20 passed. Shell passed 16, two of them after a rerun: a sign-in stuck at `booting` (KI-32).
- **On `37ffd27`:**
  - `make ci-frontend` → exit 0, with app 120 files / 1731.
  - End to end: city 6, filters 20 (one KI-32 rerun) and feed 19 passed.

Known issues: KI-54 (the draft re-created on an address without `city`) and KI-55 (resolved here).

Merged on 2026-11-17 as #79 (`f2f58cc`), on «сливай #79», after green `frontend` (run 44048799579) and
`frontend-e2e` (run 44048799675, 130 passed). WAITING for the regular deploy of the production track and the checks
inside Telegram on staging.

## X. Development track, 2026-11-17 — WP-26, listing screen

Branch `wp-26-listing`, on `main` = `3b98be2` (after #80). Eight commits: `8d8b8f1` (shared-first), `ca5f5a2` (a
WP-25 test stub), `ab33858` (wave 1), `d2280b5` (the backend stub variants), `830b541` (wave 2), `82719e1` (wave 3),
`23ec0bf` and `99b032a` (the two review rounds); the four end-to-end specs follow on the branch. It ran as plain
subagents, at most three at a time, each owning its own files:
- **Wave 0 (shared-first, alone):** the listing types, the section control types, `openOriginal`, the test helper
  `detailsOf`, the icons, the five `homi` keys and `contact_call.src`, so every later part imports only files that
  exist.
- **Wave 1:** the layer, the screen shell and the data hook; the Server Actions and the pure modules (`marketText`,
  `gestures`, `backBy`) with the shared component props; the eleven sections and `splitMaskedPhones`.
- **Wave 2:** contact and translation; the viewer and the market sheet; the actions sheet, share and close; the
  backend fixtures.
- **Wave 3 (alone):** the screen wired end to end, and the existing specs that read the placeholder markup.

The orchestrator wrote the decisions (D-1 … D-30) and the shared interface contract before the build, settled the
open legacy details by a read-only look at the legacy source (D-30), and ran the gates between the waves. Two
independent review rounds followed, each with its fixes. The specification is corrected where the code differs
(rule 6), and its "Handoff" is filled.

The listing addresses now render the real screen, intercepted over the page below and on a direct load:
- **Layer:** `ListingLayer` owns the overlay in both trees, reads its number from its own `params`, keys the overlay
  by number and opening (every opening starts at the top and photo 1), takes the focus and gives it back, and holds
  the body class and the swipe gate.
- **Screen:** every block of SCR-018 and every state of SCR-019 — skeleton, the card's preview with section skeletons,
  the details, not found, offline, server — with no digit of the author's number before a tap (DEC-52).
- **Children:** the photo viewer, the market sheet and the actions sheet (menu, report, detail) as client-only,
  portalled child routes that read the listing's resource without a request of their own.
- **Actions:** contact, translation, share, hide, block and report as Server Actions with one input object.

Developer decisions (2026-11-17):
- **Fixtures** («В PR WP-26»): the stub catalogue gets `100018` … `100021`, Tashkent-region long-rent apartments
  outside the default set with the listing-screen variants, and the per-m² comparisons of `100008` and `100009` are
  fixed, in a backend commit of this PR.
- **`splitMaskedPhones`** («lib приложения»): in `frontend/app/lib/phone/masked.ts`, not in `@homi/utils`, so no
  package or lockfile change.

ASSUMPTION_MISMATCH AM-71 (2026-11-17):
- **Assumption.** WP-26's "Components" put `splitMaskedPhones` into `frontend/packages/utils/src/phone.ts`, "exported
  from `@homi/utils`", for the app to import.
- **What was found.** `@homi/utils` is not a dependency of `frontend/app` (its `package.json` lists no such entry), so
  the import needs a `package.json` and lockfile change, which needs approval.
- **Resolution.** The developer chose the app's own lib: `lib/phone/masked.ts` with `tests/phone/masked.test.ts`. The
  specification names it.

ASSUMPTION_MISMATCH AM-72 (2026-11-17):
- **Assumption.** The first text left open whether a `[number]` layout is remounted when the number changes, and read
  the number in the fallback with `useParams()`; the pre-build decision D-20 reasoned that Next keys the segment by its
  name.
- **What was found.** The browser keys a dynamic segment by its value (`create-segment-key.browser.js` re-exports
  `createRouterCacheKey`); the server build's key, without the value (`name|type`), serves only to resume HTML. So
  every number has its own layout instance and bfcache entry. `useParams()` reads one app-wide context, so a hidden
  copy of listing A would read B's number while B is open.
- **Resolution.** `ListingLayer` reads its number with `use(params)` from its own layout and provides it to the screen
  and the child routes; it keeps the key by number and opening for the per-opening reset (D-11, KI-42).

ASSUMPTION_MISMATCH AM-73 (2026-11-17):
- **Assumption.** The actions table said "Any failure → `common.saveFailed`", and the binding decisions had
  `dev016ErrorToastOnFailure` consumed through the helpers of WP-23 — that is, `failed()`.
- **What was found.** `failed()` of `lib/ui/feedback.ts` plays the error haptic and shows the toast only with
  `dev016ErrorToastOnFailure` on, which is off. Through it, a failed hide, block or report would only vibrate, while
  legacy shows the toast in the actions sheet (`03` SCR-023).
- **Resolution.** The actions sheet shows `common.saveFailed` with the error haptic itself, always, in its own toast
  host (D-6); only contact failures go through `failed()`.

ASSUMPTION_MISMATCH AM-74 (2026-11-17):
- **Assumption.** WP-26's "Share" fell back to the share link "on any error, an old client or `false`" of
  `shareMessage`.
- **What was found.** `05` TMA-030 records that legacy uses neither the result callback nor the share events: a `false`
  means the user closed a picker that was shown. A fallback then would open a second share window.
- **Resolution.** The fallback is taken only for an old client, a failed `prepareShare` or a `shareMessage` that
  throws; a `false` ends quietly (D-5). It is a reviewer question.

ASSUMPTION_MISMATCH AM-75 (2026-11-17):
- **Assumption.** The checklist and the end-to-end lines of WP-26 took the stub catalogue of WP-12 to hold the
  listing-screen variants, and its comparisons to be in the metric they name.
- **What was found.** The catalogue had no listing with a chat link or a paid number instead of a phone, none without
  any contact and with its post kept, no video of a deleted post, no author with 20 or more listings, no history with
  one or with three events, no `near` or `city` comparison, no stats edge cases, no offer link and no second masked
  number that is not the author's. `100008` and `100009` carried whole prices in their per-m² comparison fields.
- **Resolution.** On the developer's word (D-1): `100018` … `100021` outside the default set, so the feed counts do
  not change; the per-m² values of `100008` and `100009`; `CardContractTest`, `ContactTranslationShareContractTest`,
  the docblock of `StubListingSource` and the reserved-number note of `docs/api/README.md`.

ASSUMPTION_MISMATCH AM-76 (2026-11-17):
- **Assumption.** WP-26 keyed the resource `useResource(['listing', number], …)` and took the children of the listing
  to read the server's answer from it "without a second request".
- **What was found.** `useResource` takes a string key. Its render-time seed of `initial` was written without an
  announcement, and the mount effect stamped it only for a reading user: a child route that had committed earlier
  with nothing (outside the listing's inner boundary) was never told. On a direct load in cookie mode, and whenever
  the server part streamed in after the child, the viewer, the market sheet and the actions menu would have stayed
  empty.
- **Resolution.** The key is `listing:${number}` (`listingKey`, D-18). The seed is announced by its commit in a layout
  effect that does not depend on `enabled`; a two-commit test fails on the old code. `seedResource` serves the merge
  redirect.

ASSUMPTION_MISMATCH AM-77 (2026-11-17):
- **Assumption.** WP-26's "Routes" took the intercepted tree for soft navigations and the plain tree for a hard load,
  and the directly loaded listing to stay the one listing on screen while its children change.
- **What was found.** The interception rewrite matches any address under the locale, so a soft navigation from a
  directly loaded listing, or one of its children, to a listing address is intercepted too, while the `children` slot
  keeps the standalone tree. A depth-0 close of a directly loaded child (a replace with the listing) left its portalled
  viewer or sheet above the new overlay copy, with a dead actions sheet (review X1); every such navigation mounts a
  second copy (X2).
- **Resolution.** The standalone copy drops its child routes for good once an overlay copy has shown (a latch), and
  swipe back needs `depth > 0`. The duplicate copy is KI-56; normalising a direct load into feed + pushed listing is a
  reviewer question.

ASSUMPTION_MISMATCH AM-78 (2026-11-17):
- **Assumption.** The first text gave several legacy details from the audit, and left others unverified.
- **What was found** (read-only look at the legacy source, D-30): `change_pct` is shown as the server's percent in the
  number locale, `+` only above zero, no space and no rounding (not «−7 %»); `nearby[].note` is rendered; a double tap
  needs less than 300 ms and less than 30 px; a video tap while the answer is pending does nothing but the haptic;
  legacy sends no `src` from the author row; offer links play no haptic and a hero video tap plays the light one even
  when nothing opens; the market marker's first show counts the preview's mount, so on the card → listing path it
  never ran; the hero counter shows only for more than one photo in the array on screen; the hero does not follow the
  viewer; an error replaces the whole screen.
- **Resolution.** The specification follows legacy for these, except where it records a HOMI departure (the pending
  video tap opens the viewer, `src: 'author'`, the marker runs on the first render with a median); the departures are
  reviewer questions.

ASSUMPTION_MISMATCH AM-79 (2026-11-17):
- **Assumption.** WP-26's "Contact" added the origin of `NEXT_PUBLIC_API_URL` to the link allow-list, taking the
  variable to be set wherever the app is built.
- **What was found.** Next.js inlines `NEXT_PUBLIC_*` at build time, and the end-to-end build of
  `.github/workflows/frontend-e2e.yml` set only `API_URL` (the API at `127.0.0.1:8080`), while the stub `call_url` is
  on `APP_URL` of `backend/.env.example` (`https://api.homi.loc`). The call page would have been refused in CI.
- **Resolution.** `linkHosts()` reads the variable inside the function, spelled out (an empty or malformed value adds
  nothing), and the workflow sets `NEXT_PUBLIC_API_URL: https://api.homi.loc/api/v1` for the end-to-end step (D-8).

Review findings and fixes:
- **Round 1** (on `82719e1`; behaviour, conformance, security), fixed in `23ec0bf`:
  - B1: the viewer's close and the actions chevron had no once-guard, so a quick second close also closed the
    listing. `useCloseOnce` moved into `lib/navigation` and guards both (and `RouteSheet`, the nested city picker).
  - B2 / SPEC-01: an entry holding only a failed read survived its last reader, so a reopening showed the old error
    and ignored a good server answer. `useResource` forgets an entry without data when its last reader leaves.
  - Rejected: SEC-1 (the end-to-end specs are a later step of the branch).
- **Round 2** (on the tree of `23ec0bf`; tests, cross-cutting), fixed in `99b032a`:
  - X1 (AM-77): the latch of the standalone copy. X2: swipe back needs `depth > 0`; the duplicate is KI-56. X3: the
    merge redirect steps back over an open child before its replace, so Back no longer loops through the alias.
  - T1 … T6: six tests that could not fail now fail on the broken version.
  - Rejected: T7 (a non-fraud report answered `hidden: true` cannot happen under the contract).

Own choices (no ADR):
- **One layer owner:** `ListingLayer` in both trees; route files hold no logic.
- **One body:** the preview and the details share one tree, so the hero keeps its photo; an error replaces it.
- **Resource rules** for every `useResource` user: a seed announced by its commit; an entry without data forgotten
  with its last reader.
- **Contact:** in the screen instance only, never in a module map (DEC-52; the fallback-instance gap is KI-57); the
  lock is per control and covers the whole tap; `src: 'author'` from the author row.
- **Children:** client-only `next/dynamic`, portalled; the actions route opens the steps, reads the flags and guards a
  double push.
- **Failures:** the actions sheet's own toast host (D-6); success toasts in the app's host as the close starts.
- **Fixtures** outside the default set, reusing the existing stub media.

Verified (from `frontend/` unless marked):
- **On `ab33858`:** `make ci-frontend` clean. Unit tests: app 141 files / 2035, `@homi/search` 238 + 1 todo,
  `@homi/testing` 95, `@homi/ui` 121, `@homi/i18n` 111, `@homi/api-client` 14, `@homi/utils` 2.
- **On `d2280b5`** (from `backend/`): `php artisan test --compact` → 745 passed, 4 skipped; Pint passed.
- **On `830b541`:** `make ci-frontend` clean, app 152 files / 2269 + 1 todo.
- **On `82719e1`:** app 153 files / 2281 + 1 todo; `pnpm -r lint`, the app typecheck and `pnpm --filter app build`
  clean.
- **On `23ec0bf`:** app 153 files / 2287 + 1 todo.
- **On `99b032a`:** `make ci-frontend` clean, app 153 files / 2304 + 1 todo; the packages as above.
- **End to end:** each of the 18 files alone against a local `next start` of the `99b032a` build, 180 passed (the
  specification's "Handoff" lists the reruns); in CI on `43d558a` all 18 files in one run, 180 passed.

Known issues: KI-56 (low: the duplicate overlay copy of a directly loaded listing), KI-57 (low: a contact revealed in
the fallback instance), KI-58 (info: the stub listing methods ignore `access_*`); KI-41 partly done (minimal focus on
the listing layer, the rest WP-33's), KI-42 resolved for the listing layer, KI-43's listing part done.

Merged on 2026-11-17 as #81 (`95315fd`), on «сливай #81», after green `frontend` (run 44146798245), `backend` (run
44146798129) and `frontend-e2e` (run 44146798203, 180 passed). WAITING for the regular deploy of the production track
and the checks inside Telegram on staging.

## Y. Development track, 2026-11-17/18 — WP-27, map: MapLibre GL engine

Branch `wp-27-map-gl`, on `main` = `d4c0d88` (after #82). It ran as plain subagents, at most three at a time, each
owning its own files, after a vertical slice the orchestrator built and checked on `next start` first (the worker,
the CSP, WebGL in headless Chromium):
- **Slice (`bca55ab`):** the worker copy script, `gl/library.ts`, the view contract `types.ts`, the twelve label
  fonts.
- **Wave 1 (`bcd58f8`):** the pure modules with their unit tests — the engine rule and launch options; the basemap,
  palette, fonts and style builder; grouping, spread, camera, mask and prefetch; `useMapPoints`, the marker DOM and
  its CSS, the ESLint rule, the link hosts, the three keys.
- **Wave 2 (`aa60ff3`, `c8ec053`):** the screen; the selection card, the card layer and the warm-up; the GL view.
- **Wave 3:** the end-to-end specs (`d4e077c`) and, in parallel, one review in three lenses (behaviour, security,
  conformance) with one refuting agent per finding; the fixes follow.

The search map now renders: the engine of the session, the points of the map's own search as pins, stacks and
clusters, the spread and the selection card with lazy previews, the camera rules, the area mask, locate, the
attribution, the loading, empty and error states, and the warm-up from the list. A device the rule sends to Leaflet
sees «Карта на этом устройстве пока недоступна» until WP-28 (DEC-45).

Developer decision (2026-11-18): **label fonts** («Поставить fonttools») — upstream Noto publishes no woff2 subsets,
so fonttools 4.68 (with brotli) was installed in a throwaway virtual environment on the development machine only, and
the twelve subsets were cut from the unhinted Noto Sans 2.015 TTFs; nothing is added to the repository's toolchain.

ASSUMPTION_MISMATCH AM-80 (2026-11-18):
- **Assumption.** WP-27's engine table chose GL for a saved `gl` "when any WebGL context can be created".
- **What was found.** MapLibre 6 needs WebGL2: `new Map` throws `GPUInitializationError` without it (CHANGELOG
  6.0.0, `src/ui/map.ts`). A WebGL1-only device with a saved `gl` would fail on every open.
- **Resolution.** Row 4 probes WebGL2 without the caveat flag; the specification says so.

ASSUMPTION_MISMATCH AM-81 (2026-11-18):
- **Assumption.** WP-27 left open how MapLibre's worker loads under the bundler and the nonce CSP, and whether its
  CSP build is needed.
- **What was found.** MapLibre 6 has no CSP build; its worker is an ES module that imports a shared module, and
  Turbopack emits the worker without that sibling (maplibre-gl 6.11.2 `docs/index.md`). A same-origin worker also
  takes the policy of its own response, and the proxy skipped every path with a dot, so vector template tiles fetched
  inside the worker were outside `connect-src` (review SEC-1).
- **Resolution.** `scripts/copy-maplibre-worker.mjs` copies both files into `public/maplibre/<version>/` before
  `dev` and `build`; `loadMapLibre()` sets the worker URL; the proxy answers `/maplibre/` with a worker policy
  (`default-src 'none'; script-src 'self'; connect-src 'self' <CSP_TILE_HOSTS>`); its cache stays Next.js's
  revalidated `max-age=0`, because the proxy cannot tell a file from a missing version and a one-year cache would keep
  a 404 that a rollback brings back.

ASSUMPTION_MISMATCH AM-82 (2026-11-18):
- **Assumption.** WP-27 fetched OSM raster tiles through a custom `homiosm://` protocol so the requests carry a
  referrer whatever the page policy is.
- **What was found.** MapLibre fetches raster tiles with `fetch` and honours a `referrerPolicy` returned by
  `transformRequest`; the slice showed the tile requests with the origin-only referrer.
- **Resolution.** `osmTransformRequest` sets `strict-origin-when-cross-origin` for `https://tile.openstreetmap.org/`;
  no protocol.

ASSUMPTION_MISMATCH AM-83 (2026-11-18):
- **Assumption.** WP-27 took the twelve Noto Sans woff2 subsets "from the upstream Noto release" and left open how
  MapLibre 6 consumes them.
- **What was found.** Upstream publishes TTF/OTF only, no woff2 and no subsets; this machine had no subsetting tool.
  MapLibre 6 reads woff2 through the style's `font-faces` (one `unicode-range` element per range, keys equal to the
  `text-font` names, the weight from the file), with no `glyphs` URL.
- **Resolution.** The developer chose fonttools (above); `gl/fonts.ts` holds the ranges, the specification the
  command.

ASSUMPTION_MISMATCH AM-84 (2026-11-18):
- **Assumption.** WP-27 expected headless Chromium to fail the caveat probe (so GL specs would launch with
  `?map=gl`), and an OSM tile route registered after `launchApp` to answer the tiles.
- **What was found.** Under Playwright's SwiftShader the WebGL2 probe with `failIfMajorPerformanceCaveat` succeeds, so
  GL is the default pick; and the page's CSP refuses a tile request before any route sees it.
- **Resolution.** The end-to-end server (`playwright.config.ts`, the CI workflow) gets `CSP_TILE_HOSTS`, the guard
  of `@homi/testing/playwright` answers OSM tiles with a blank PNG, and the unavailable state is launched with
  `?map=leaflet`.

ASSUMPTION_MISMATCH AM-85 (2026-11-18):
- **Assumption.** WP-27 read `?map=` and `?mapdebug` from the launch when the map shows.
- **What was found.** The launch query was private to `lib/deeplinks/launch.ts`, and the view toggle keeps only the
  search keys, so the map's address has neither parameter.
- **Resolution.** `launchMapOptions()` reads the query captured when the module loads; `Launch.mapDebug` is parsed.

ASSUMPTION_MISMATCH AM-86 (2026-11-18):
- **Assumption.** WP-27's file list named no existing end-to-end spec.
- **What was found.** `data.spec.ts` (the whole WP-22 proof), one test of `gates.spec.ts` and the lasso step of
  `shell.spec.ts` depended on the map placeholder or on a drawing mode that WP-27 closes at once.
- **Resolution.** `data.spec.ts` keeps every check, re-hosted on the map's read and the feed; the gates test refuses
  the map's read; the lasso step lands on the plain map until WP-28.

Review findings and fixes (each finding checked by a refuting agent; each fix came with a test that its builder
showed failing against the broken version — reported by the builders, not re-run by the orchestrator):
- **Round 1** (on `d4e077c`; behaviour, security, conformance — 11 findings, 5 refuted), fixed in `c11aefd` and
  `f7100dc`: the `draw=1` layer closed once per address instead of once per opening; no spinner during the library
  load; fit memory and a city jump on the Tashkent stand-in (`cityKnown`); DEV-013's pin entry left behind by a replace
  (KI-59); the worker without a policy of its own (AM-81); the shell spec's lasso step. The worker's one-year cache
  went again in `f7100dc` (a 404 of a missing version would have been kept).
- **Round 2** (on `f7100dc`; the fixes, cross-module flows — 3 findings), fixed in `782216a`: the map bar read the
  default search under a listing opened from the card (KI-43's map part); the demo marker did not come back with the
  map (`SourceReporter`, as the feed); DEV-013's lasso over an open card left a Back that did nothing.

Own choices (no ADR):
- **Worker files** generated before `dev` and `build`, git-ignored, under a versioned path; `prewarm()` keeps the
  worker alive across the route's Activity hide and show.
- **Style rebuilds** always through `setStyle(…, { diff: true })` from one pure builder that carries the mask and
  "me" data; the map is created once per mount.
- **Markers** as DOM elements (text only), taps from the map's own `click`, the spread taken out of the cluster index.
- **The test hooks** (`data-map-*`, `data-marker`) named in the build notes and used by `e2e/map.spec.ts`.
- **The e2e guard** answers OSM tiles itself, so no spec can reach the public tile server.

Known issues: KI-59 (low: `history.ts` matches a `popstate` by address), KI-60 (low: a spread-pin tap during the
card's snap); KI-43's map part done.

Verified (from `frontend/`):
- **The slice (`bca55ab`):** a production build and a probe against `next start`: the worker and its shared module
  load under the nonce CSP, `load` and `idle` fire, OSM tiles carry the origin-only referrer, headless Chromium passes
  the caveat probe.
- **On `c11aefd`:** `make ci-frontend` clean, app 168 files / 2600 + 1 todo.
- **On `782216a`:** `make ci-frontend` clean — app 168 files / 2608 + 1 todo, `@homi/search` 238 + 1 todo,
  `@homi/testing` 95, `@homi/ui` 121, `@homi/i18n` 112, `@homi/api-client` 14, `@homi/utils` 2.
- **End to end:** each of the 19 files alone against a local `next start` of the `782216a` build, 198 passed (two map
  tests made to wait for what they assert in `192f285` after failing under machine load, then `map.spec.ts` 17 of 17
  alone).

Merged on 2026-11-19 as #83 (`4e35154`), on «сливай #83», after green `frontend` (run 44196889825) and `frontend-e2e`
(run 44196889879, 198 passed) on `94a414d`. WAITING for `CSP_TILE_HOSTS` and the regular deploy of the production track
and the checks inside Telegram on staging.

## Z. Development track, 2026-11-18 — WP-28, map: Leaflet engine, lasso, spot map

Developer's word (2026-11-18): «Следующий пакет — WP-28», given while #83 (WP-27) was in review. The branch
`wp-28-map-leaflet-lasso` therefore starts from `wp-27-map-gl` at `94a414d` and its PR is stacked on #83: its base is
`wp-27-map-gl` until #83 merges, then `main`. It ran as in §Y — a vertical slice the orchestrator built and checked on
`next start` first, then plain subagents, at most three at a time, each owning its own files:
- **Slice (`7d57dc7`):** `leaflet/library.ts`, the map and its camera, the raster tiles, the clusters; `MapUnavailable`
  and `map.unavailable` removed; the marker elements moved to `features/map/` for both engines. **Skeleton
  (`0db8dea`):** the stub hooks the builders filled in, so that no two of them edited one file.
- **Wave 1 (`949696b`, `c6dea7f`, `6b14977`):** the Leaflet view; the lasso and drawing on both engines; the spot map.
  **Follow-ups (`6a6d124`, `297ca2c`):** the changes the builders could not make in their own files (one prefetch cap,
  the GL markers' deferred re-sync, the spot route's leave rule, `Maximize2`).
- **Wave 2 (`f4a7c5b`):** the end-to-end specs, which found two bugs fixed in the same commit (a Leaflet cluster and the
  spread dot shrank in the empty icon box; the spot map's container was 0 px high on GL, the cause of `c8ec053`).
- **Reviews (`31aa139`, `f7ba4b2`):** below.

ASSUMPTION_MISMATCH AM-87 (2026-11-18):
- **Assumption.** WP-28's end-to-end section expected headless Chromium to fall to Leaflet by rule, with GL cases
  launched with `?map=gl`.
- **What was found.** As in AM-84, SwiftShader passes the WebGL2 probe, so GL is the default pick.
- **Resolution.** The Leaflet cases launch with `?map=leaflet`; `map-lasso.spec.ts` and `spot-map.spec.ts` run on both.

ASSUMPTION_MISMATCH AM-88 (2026-11-18):
- **Assumption.** WP-28 drew the Leaflet attribution with Leaflet's control without its prefix.
- **What was found.** The control writes its attribution as an HTML string, and `MapScreen` already draws the same
  attribution for GL with `MapAttribution`, whose links go through `tg.openLink`.
- **Resolution.** No attribution control on either engine: `MapAttribution` serves both maps and the spot map;
  protomaps-leaflet's own attribution (an HTML string by default) is emptied.

ASSUMPTION_MISMATCH AM-89 (2026-11-18):
- **Assumption.** WP-28 named protomaps-leaflet's layer with "the palettes of WP-27 and label rules", leaving open how a
  vector failure is seen.
- **What was found.** At 5.1.0, `paintRules(flavor)` / `labelRules(flavor, lang)` paint every road class in one colour,
  ignore lite mode and need a full `@protomaps/basemaps` flavor; and the library reports no tile failure:
  `renderTile` logs a rejected tile, paints it without the source and tells Leaflet it loaded.
- **Resolution.** `basemapRules.ts` writes the rules layer by layer from GL's style with the palette's colours (zooms on
  the Leaflet scale); `watchVectorErrors` wraps the layer's sources and switches to the raster; the failure state and
  its one report per session are shared with GL in `features/map/useBasemap.ts`. A template's 404 counts as a failure
  on Leaflet (KI-62).

ASSUMPTION_MISMATCH AM-90 (2026-11-18):
- **Assumption.** WP-28 imported Leaflet, its plugins and their CSS inside the view's chunk, as one import.
- **What was found.** Leaflet 1.9.4 ships only a UMD build, which sets `window.L` when it runs; markercluster reads
  that global when it runs and protomaps-leaflet when a layer is made.
- **Resolution.** `leaflet/library.ts` `loadLeaflet()` loads the three in order once per session (GL's
  `loadMapLibre()` pattern); the other modules import Leaflet's types only.

ASSUMPTION_MISMATCH AM-91 (2026-11-18):
- **Assumption.** WP-28 asked the production track to extend `img-src` with the tile hosts and to keep the origin in
  tile requests.
- **What was found.** `lib/security/csp.ts` already lists `CSP_TILE_HOSTS` in `img-src`, and `proxy.ts` sets
  `Referrer-Policy: strict-origin-when-cross-origin`; the slice showed Leaflet's tile images requested with
  `referer: http://localhost:3001/` and no CSP report. `TileLayer`'s `referrerPolicy` also sets it per image.
- **Resolution.** Nothing new is asked of the production track beyond WP-27's `CSP_TILE_HOSTS`.

ASSUMPTION_MISMATCH AM-92 (2026-11-18):
- **Assumption.** WP-28's `SpotMapRoute` read the listing with `useListing()` from the resource cache and left on a
  listing error.
- **What was found.** `useListing()` makes the read and needs the server's first answer; the cache-only reader is
  `useListingRecord()`, as the photo viewer, market and actions children use. In cookie mode a server failure stays in
  the screen's first answer and never reaches the resource.
- **Resolution.** `SpotMapRoute` reads `useListingRecord(useListingNumber())`; the listing layer's context carries the
  screen's reported state, so the route also leaves on a cookie-mode `not_found`, `offline` or `server`.

ASSUMPTION_MISMATCH AM-93 (2026-11-18):
- **Assumption.** WP-28's lasso table deferred the marker re-sync by 150 ms during a two-finger move, without saying how
  on each engine.
- **What was found.** MapLibre's `panBy` / `zoomTo` without animation fire `moveend` at once, and GL's marker layer
  syncs on every `moveend`; Leaflet's public `panBy` fires `moveend` on every call.
- **Resolution.** GL: the lasso's camera moves carry `LASSO_MOVE`, and the marker layer re-syncs once,
  `LASSO_RESYNC_MS` after the last of them. Leaflet: the host moves the pane as Leaflet's own drag does
  (`_rawPanBy`, KI-61) and fires one `moveend` 150 ms after the last move; a pinch steps whole zooms.

Review findings and fixes (each finding checked by a refuting agent; each fix came with a test shown failing against
the broken version by the orchestrator):
- **Round 1** (on `f4a7c5b`; the Leaflet view, drawing, the spot map, security and regressions — 4 findings, 1 refuted),
  fixed in `31aa139`: a Leaflet pin was reused for another listing at the same address with the same label, so its
  tap opened a listing no longer in the search (the signature now names the listings); a Leaflet map removed within
  250 ms of a zoom animation (or mid-pinch) threw from Leaflet's timer (`removeLeafletMap`); under StrictMode in
  `next dev` a GL chunk failure while drawing was reported twice and Back ran twice (a once-guard in
  `ViewChunkFailed`). Refuted: a lint guard for Leaflet's HTML-string options (no such sink is used).
- **Round 2** (on `31aa139`; the fixes and cross-module flows — 1 finding), fixed in `f7ba4b2`: the wheel's debounce
  timer also outlived the removal. The flows lens (the filters hand-off, the finished stroke, the spot map's Back
  order, the session's engine across both maps, the shared prefetch cap) found nothing.

Own choices (no ADR):
- **Skeleton first:** stub hooks with fixed signatures, so three builders could fill one view without sharing a file.
- **One prefetch cap:** `prefetchTileUrls` in `tilePrefetch.ts` serves the list's warm-up and Leaflet's in-map
  prefetch.
- **Gestures paused while drawing** on both engines, and marker taps ignored, so the strips the overlay leaves under the
  bars neither pan the map nor open a card.
- **The spot map** is re-created rather than restyled on a theme, lite or locale change; the fullscreen map is a
  dialog (focus, Escape) like the photo viewer; `SpotMapRoute` is imported statically, only the engines are lazy.
- **Leaflet's selected marker** raised with `setZIndexOffset`, not CSS; a dark raster filter approximates GL's paint.

Known issues: KI-61 (low: Leaflet and protomaps-leaflet internals at the pinned versions), KI-62 (low: a template's 404
tile switches Leaflet to the raster).

Verified (from `frontend/`):
- **The slice (`7d57dc7`):** a production build and a probe against `next start` with `?map=leaflet&mapdebug`: four
  stacks, one cluster of 44 zoomed out, the card, icon roots without a size, OSM tile images with the origin-only
  referrer, no console error or CSP report.
- **On `f7ba4b2`:** `make ci-frontend` — types, lint, typecheck and the build passed; the test step failed once with
  `ENOENT` on `node_modules/.vitest-cache` in `@homi/search` (no assertion failed), and `pnpm test` again passed: app 183
  files / 2831 + 1 todo, `@homi/search` 238 + 1 todo, `@homi/testing` 95, `@homi/ui` 121, `@homi/i18n` 112,
  `@homi/api-client` 14, `@homi/utils` 2.
- **End to end:** each of the 22 files alone against a local `next start` of the `f7ba4b2` build, with a pause between
  files (KI-32): 237 passed (map 17, map-leaflet 17, map-lasso 9, spot-map 13 and the 18 earlier files as in §Y plus
  their changes); the same on the `f4a7c5b` build.

Merged on 2026-11-19 as #84 (`0ab4417`), on the developer's «сделай все что нужно погнали» (read as «сливай» for #84,
#85 and #86, each after its own green CI), retargeted to `main` after #83 (the merge tree equals the tree its CI had
checked), after green `frontend` (run 44254527108) and `frontend-e2e` (run 44254527223, 237 passed) on `9e9587e`;
`frontend` green on `main` after the merge (run 44410445948). WAITING for the regular deploy of the production track
(with WP-27's `CSP_TILE_HOSTS`) and the checks inside Telegram on staging.

## AA. Development track, 2026-11-18 — WP-29, favourites and history

Branch `wp-29-saved`, on `main` = `d4c0d88` (after #82). WP-29 depends only on WP-26, so it does not stack on #83 or
#84; its docs touch the same files as theirs (the queue, these notes, the session handoff) and are merged by hand
when those land. Developer's word: «Следующий пакет — WP-29».

The Heart tab's two lists now render: `/saved` (SCR-024) and `/saved/history` (SCR-025).
- **Rendering:** page one is read on the server with the session cookie, else in the browser through `/bff`, both in
  WP-24's `ListingFeed`, 20 at a time with the feed's cursor (DEC-53).
- **Session maps:** favourites drop listings un-favourited or hidden in this launch. History shows every entry and
  never the eye.
- **«Очистить»:** it asks first, then sends `DELETE /history` and shows the empty state with the success haptic.
- **Refresh:** pull-to-refresh reloads either list from page one.

WP-24 had shipped every prop and the cursor guard, so `ListingFeed` and `useCursorFeed` are unchanged. The build ran
in two workflows:
1. Two builders on disjoint files against the orchestrator's decisions and a read-only look at the legacy source,
   then a gate.
2. One end-to-end writer, and two review lenses with a refuting verifier per finding (5 of 5 confirmed, 4 distinct,
   fixed before `fcba4ca`).

Assumption mismatches (rule 6, in the specification):
- **AM-94.** The specification took a tab entering a saved page to re-create its list, as legacy's re-mount did
  (`App.jsx:618`). Next keeps up to three routes alive under `<Activity>` (`preserving-ui-state.md`), so the old list
  would stay. Every server render of the page now brings a new `renderId` in the list key:
  - cookie mode adopts the fresh server page one with no browser request;
  - header mode asks `/bff`.
- **AM-95.** The specification put the size of the `seen` map into history's key, as legacy did. That re-creates the
  list at the card's tap, under the listing's layer, racing the server's write of the view. The size is now latched
  per version and compared on the return to the list's address.

The legacy history rule (no filtering by the hidden map, `ListingFeed.jsx:86-91`) was read in the reconstructed
source at SVN r29. That source is synced to release `index-BnFvC-Ft`, one newer than the pinned `index-DY_DH7h-`, and
its delta report does not touch the saved views. Read it again when WP-02 pins the baseline.

Review fixes:
- the `renderId` drawn after `io()` (the runtime shell stage of `partialPrefetching`);
- the list shown when `DELETE /history` answers is the one cleared;
- `aria-disabled` keeps the focus on «Очистить»;
- after a clear, the empty state takes the focus and a status line reads it;
- a new key gives the list a lost focus (the card the listing's layer returns it to is gone after history's
  re-creation).

Own choices (no ADR):
- **One hook** (`useSavedList`) for both lists' keys, pulls, the top and the focus.
- **The cleared state** replaces the list until the next key, as legacy emptied its items with no refetch.
- **The `Trash` icon** is re-exported from `@homi/ui`, as legacy's `Trash` 15 px.

Verified (from the repository root unless marked):
- `make ci-frontend` on `fcba4ca` passed: types, lint, typecheck and the build. Unit tests: app 157 files / 2405 +
  1 todo, `@homi/search` 238 + 1 todo, `@homi/testing` 95, `@homi/ui` 121, `@homi/i18n` 111, `@homi/api-client`
  14, `@homi/utils` 2.
- End to end: each of the 19 files alone against a local `next start` of the `fcba4ca` build, 190 passed, none skipped: back 11, boot-failure 6, city 6, crash 4, csp 2, data 5, feed 19, filters 20, foundation 19, gates 8, launch 5, listing-actions 14, listing-contact 14, listing-open 16, photo-viewer 6, saved 10, session 7, shell 16, smoke 2. Before the review fixes the end-to-end writer ran `saved.spec.ts` 10/10 three times and the neighbouring specs green (listing-open once 15/16, then 16/16 twice; not reproduced).

Known issues: none new. LB-APP-027 (a silent failed clear with DEV-016 off) stays as the flag decides.

Merged on 2026-11-19 as #85 (`ee5f7cd`), on the same word, after `main` was merged in as `e3b24f3` (conflicts in the
docs only) and green `frontend` (run 44410780522) and `frontend-e2e` (run 44410780607, 247 passed) on it. WAITING for
the regular deploy of the production track and the checks inside Telegram on staging.

## AB. Development track, 2026-11-18/19 — WP-30, radars

Branch `wp-30-radars`, on `main` = `d4c0d88` (after #82). WP-30 depends on WP-25 and WP-26 only, so it does not stack
on #83, #84 or #85; §Y, §Z and §AA are on those open PRs, and this letter keeps the order once they merge. Five
commits: `7c573de` (the radar data layer, the subscribe flow and the seams of the earlier packages), `1350bc2` (the
radar tab, the sheets, the survey, the nudges and the feed card), `22bd976` (the end-to-end specs, the `@radars-off`
run and its CI step; the editor beside the radar sheet, the radar tab's chrome on Back), `dafe3bb` (the review and
end-to-end fixes) and `0eafcf8` (the tab read at request time only, the cookie first). It ran as plain subagents, each
owning its own files, against the orchestrator's decisions and three fact maps (the seams, the libraries and the
contract) and a read-only look at the legacy source:
- **Stage 1:** the data layer (Server Actions, `normalize.ts`, `useRadars`, chat access, settings, `filtersHash`)
  beside the UI and shell seams (`instant`, the sweep art, the switched-off redirect, routes, `from=radar`, «+», the
  catalogues).
- **Stage 2:** the subscribe flow (`subscribe.ts`, `toasts.ts`, `match.ts`) and its callers.
- **Stage 3:** the radar tab and sheet; the new-radar, editor and survey sheets; the nudge host and the follow nudge.
- **Stage 4:** the visits, the return banner and the radar card in the feed.
- **End to end:** three writers (the radar screens and forms; the nudges; the switched-off run with its config and
  workflow step).
- **Review:** three lenses (state and navigation; data and API; parity, accessibility and tests), each finding checked
  by a verifier asked to refute it, then one round of three fixers.

The specification is corrected where the code differs (rule 6), and its "Handoff" is filled with the review, the
mutation checks and the questions for the reviewer.

The radar part of the Mini App now works on stubs:
- **Radar tab:** the "soon", loading, error, empty and tile states, from one `GET /radars?include=previews`; the tile
  switch; pull-to-refresh; «+» only while radars are on.
- **Radar sheet:** the strip of finds, the send switch, the mode rows with the digest hours, the editor, unhide,
  delete with the survey, and «Смотреть найденное» with the return to the same sheet and scroll position.
- **Forms:** «Новый радар» and «Условия радара» over `FiltersForm`, and «Нашли жильё?».
- **One subscribe flow** with the chat-access flow, for the filters footer, the few-results note, the forms and the
  three offers.
- **Nudges:** `NudgeHost` with one slot (return banner > follow nudge > home offer), the follow nudge, the search
  visits, the return banner and the radar card in the feed; "shown" marked on the first render (LB-APP-050).
- **Switched off (DEC-51):** no radar request, no offer and no radar sheet; the tab says radars are coming soon.
- **Shared changes:** `invokeAction`, `readResource`, `seedResource` aborting a read in flight and `invalidate`
  keeping a user-less entry with data as stale; `currentAddress()`; `routes.radarNew(q?, entry?)` and
  `routes.radarFound({ trigger })`; `write` dropping `from=radar`, `rememberHref` skipping it, the `TabBar` rule and
  the radar tab's chrome under a radar sheet; `instant` of `RouteSheet` and `BottomSheet`; the restyled `Switch`;
  `filtersHash` of `@homi/search`; the second end-to-end run in CI.

ASSUMPTION_MISMATCH AM-96 (2026-11-18):
- **Assumption.** WP-30's tab read `GET /radars?include=previews` on the server and handed it to `useRadars` as
  `initial`, taking the tab entered again to show a fresh list, as legacy re-mounted `RadarScreen` on every entry.
- **What was found.** `useResource` ignores a second `initial` for a key it already holds, and Next keeps up to three
  routes alive under `<Activity>` (`preserving-ui-state.md`), so a tab entered again would keep its old list — the
  class of WP-29's AM-94.
- **Resolution.** Every server render that reads the user draws a new `renderId` after `io()`, and `RadarScreen`
  adopts each new one once: a seed of the render's list, or a `/bff` re-read when the render has none (header mode).
  A `renderId` seen before (Back, the return from a layer) changes nothing. The read runs at request time only, the
  cookie first.

ASSUMPTION_MISMATCH AM-97 (2026-11-18):
- **Assumption.** WP-30's "Tests" had the default run exclude the tag `@radars-off` in `frontend/playwright.config.ts`
  and the second CI step run `pnpm test:e2e --grep @radars-off`.
- **What was found.** Playwright 1.65.1 applies a CLI `--grep` in addition to the config's `grepInvert`, never instead
  of it, so the excluded tests cannot be selected that way.
- **Resolution.** `E2E_RADARS_OFF=1` switches the config to `grep: /@radars-off/` (`@flaky` stays out in CI). The
  workflow starts a second API on stubs on `127.0.0.1:8081` with `RADAR_CREATION_ENABLED: 'false'`, checks that
  `GET /reference` answers `"radars_enabled":false`, and runs the tagged tests against it after a green first run.

ASSUMPTION_MISMATCH AM-98 (2026-11-18):
- **Assumption.** WP-30 had `return-nudge.spec.ts` and `feed-radar.spec.ts` use a search that no fixture radar of
  WP-13 covers.
- **What was found.** By `hasRadarFor` (for default filters, any radar of the same base deal and city) the fixtures
  `…0001`, `…0002` (Tashkent long rent) and `…0003` (Tashkent sale) cover every default Tashkent search. The
  uncovered default searches of the other stub cities are too short for the 8th-card slot and show the few-results
  note.
- **Resolution.** The default-filter cases answer `**/bff/radars*` themselves through `page.route`, registered before
  the launch, with the API envelope (a bare `[]` reads as a failed read and shows no offer). Custom searches keep the
  real list, and each spec checks that the offer is absent while the fixture radars are in place.

ASSUMPTION_MISMATCH AM-99 (2026-11-18):
- **Assumption.** WP-30's checklist and "Tests" took the local stack's backend env to have
  `RADAR_CREATION_ENABLED=true`, as `backend/.env.example` does.
- **What was found.** `GET /reference` on `api.homi.loc` answered `radars_enabled: false` on 2026-11-18: the developer
  machine's backend env has radars switched off.
- **Resolution.** The local end-to-end runs with radars on used a second stub API (`php -S 127.0.0.1:8092` from
  `backend/public` with `RADAR_CREATION_ENABLED=true` in the process env and `PHP_CLI_SERVER_WORKERS=6`); the
  radars-off spec ran against `api.homi.loc`. KI-65.

Review findings and fixes, all in `dafe3bb`: 20 findings, 13 confirmed by the verifiers (12 distinct, one found by two
lenses), 7 refuted; the end-to-end stage found four app bugs (K1 … K4: a find's listing under the radar sheet, Back
from a directly loaded editor, the radar feed opened at the tab's scroll, one radar read too many after a sign-in).
Each fix has a test that fails on the unfixed code; the specification's "Handoff" lists them with their mutation
counts.

Verified:
- **On `7c573de` … `0eafcf8`, between the stages:** the app typecheck, `pnpm -r lint` and the unit suite after each
  stage (app 164 files / 2510 + 1 todo after the subscribe stage, 180 / 2797 after the screens, 181 / 2833 after the
  fixes).
- **`make ci-frontend` on `0eafcf8`:** exit 0, the build without a prerender warning. Unit tests: app 181 files /
  2833 + 1 todo, `@homi/search` 241 + 1 todo, `@homi/testing` 95, `@homi/ui` 138, `@homi/i18n` 112,
  `@homi/api-client` 14, `@homi/utils` 2.
- **End to end, locally** (a `next start` on :3001 against a second stub API with radars on, KI-65; one on :3003
  against `api.homi.loc` with radars off): before the fixes every default file green, each at least twice, and
  `radars-soon` 14 passed four times; after the fixes, on the `0eafcf8` build, `radars.spec.ts` 31 passed (its seven
  former `fixme` cases included), back 11, boot-failure 6 and city 6 — then the local database host went down (a power
  cut, 2026-11-19) and the run stopped there. The whole suite, both runs, is CI's.

Known issues: KI-64 (info: the stub radar writes are not stored), KI-65 (low: radars switched off in this machine's
backend env), KI-66 (low: a directly loaded `/filters?pick=city` closed at depth 0 stacks two filter sheets, WP-25).

Merged on 2026-11-19 as #86 (`a818440`), on the same word, after `main` was merged in as `f47019b` and green `frontend`
(run 44459187188) and `frontend-e2e` (run 44459187243, 350 passed, then the `@radars-off` run 14 passed) on `4abd8d0`.
The merge kept both sides of the docs and the code (`AppShell`, the gallery, the icon test, the homi catalogues and
their test) and fixed one semantic conflict: WP-29's `FavoritesScreen` and `HistoryScreen` tests render `FeedEmpty`,
whose `FewResultsNote` now reaches the radar Server Actions, so they mock `@/features/radars/subscribe` and
`@/features/radars/match` as `FeedEmpty.test.tsx` does; `make ci-frontend` on the merge → exit 0, app 215 files / 3461 +
1 todo. In CI on `f47019b` one end-to-end case failed (`feed-radar.spec.ts`, header mode: after a reload the browser
restored the scroll and the list asked for its second page, 33 cards, not 20); the case now scrolls to the top before
the reload. WAITING for the regular deploy of the production track, with `RADAR_CREATION_ENABLED` unset (DEC-51), and
the check of the "soon" state inside Telegram on staging.

## AC. Development track, 2026-11-19 — legacy release intakes: `index-BnFvC-Ft`, a third release, `index-CBlEKxdL`

**The intake of `index-BnFvC-Ft.js`** (branch `feat/intake-index-BnFvC-Ft`, #88) was merged on 2026-11-19 as `eb36036`,
on «сливай #88», after `main` was merged in as `f318405` (the after-merge docs PR #87 had been merged as `83fef19` on
«сливай #87») and green `backend` (run 44487499748), `frontend` (run 44487499658) and `frontend-e2e` (run 44487499785,
350 passed, then the `@radars-off` run 14 passed) on it. On `0b722d5` the end-to-end job had failed twice on tests
outside the PR's code and passed on the third attempt (run 44475570251; KI-63). `main` after the merge: `backend` (run
44491608203) and `frontend` (run 44491607150) green. WAITING for the regular deploy of the production track: stubs only,
no new environment key, no migration.

**A third release.** On 2026-11-19 the developer asked again whether the plan needs correcting. The legacy checkout by
then held `index-CIa0Ldj2.js` (production 18 Nov 2026; source at SVN r33, the changelog at r36), one release past
`index-CBlEKxdL.js`, whose intake had not started. Three subagents read it and compared it with `main` (`eb36036`)
without changing anything: 62 items in legacy, 97 verdicts against HOMI — 35 already the same, 37 differences in built
code (about 2 000 lines, the largest about 220), 6 contract changes on stubs with one new route (41 pairs), 8 for
specifications only, 3 not applicable, 4 for the developer. Five `DEV` flags that are off (DEV-010 wording, DEV-014,
DEV-016 error half, DEV-017, DEV-051) are legacy behaviour in that release. The drafts are kept outside the repository
until the intake of that release.

**The developer's decision** (2026-11-19, `docs/migration/decisions/2026-11-19-developer-answers.md`): «По релизам, код
до WP-31» — the intake of `index-CBlEKxdL.js`, the intake of `index-CIa0Ldj2.js`, the owner-cabinet plan, the catch-up
packages for the built code, then WP-31; each its own branch and PR, merged on its own «сливай».

**The intake of `index-CBlEKxdL.js`**: branch `feat/intake-index-CBlEKxdL` on `main` = `eb36036`, PR #89, in review.
Commits: `371c553` (the `legacy` catalogue re-imported: 563 names, four `homi` overrides for texts with the legacy
brand), `f725147` (the audit: 141 new ids, the registers, 988 moved line references), `edf01cc` (the pin, the
specifications of the changes outside the cabinet, the queue rows, the table of built code behind the pin), `60e5fff`
(review fixes) and the memory commit. It records what legacy does; what HOMI builds for the cabinet is left to the
owner-cabinet plan, so `09` has no cabinet rows yet. It ran as plain subagents: one integrator wrote an id map over the
three drafts of the night (their proposed ids collided and five items were described twice), three writers then worked
on disjoint files, and two reviewers read every cross-reference to a new id against the title of its target (1 214
mentions; none wrong) and every entry against its source (no fact lost; ten small findings fixed).

Verification, run in the main session: `make ci-frontend` on `371c553` → exit 0 (app 215 files / 3461 + 1 todo, i18n
114, search 241 + 1 todo, ui 138, testing 95, api-client 14, utils 2); the later commits change only `docs/` and
`.ai/memory/`. On `60e5fff`: `python3 -I scripts/migration/collect_ids.py --check` → exit 0, 2 405 ids;
`build_open_questions.py` → 267 questions; `task_graph.py --check` → exit 0; the three JSON registers parse;
`features.csv` 148 rows of 19 columns; all 497 rule rows of `07` and all 312 id-carrying references of `09` and
`features.csv` point at the line that defines their id (437 and 312 on `main`). Today's legacy locale files with the
next release's diffs reverse-applied are byte-identical to the copy the catalogue was imported from. The backend is
untouched; the end-to-end suite was not run locally.

ASSUMPTION_MISMATCH AM-100 (2026-11-19):
- **Assumption.** The intake procedure (WP-02 Part B, `25` §8) reads a release from the legacy checkout: the tree is
  taken to hold the release until its intake is written, and the audit cites its lines.
- **What was found.** The checkout moved twice within one working day. At the read for #88 it was already one release
  past the release taken in, and the release of this intake (r31) was overwritten by the next sync (source r33, 71 of
  the source files changed) before the intake was written. `svn cat` and `svn up` are not used, so an older state cannot
  be read back.
- **Resolution.** A release is read when it appears, with `svn info` and the time of the read, and kept as a draft; the
  locale files are copied outside the tree at the read. An older state of a file is rebuilt from today's file by
  reverse-applying the next release's `delta/units` diffs and compared byte for byte with the copy. `baseline.md` names
  the revision the line references belong to and says that they are not those of today's checkout; the next intake reads
  the changed files again.
