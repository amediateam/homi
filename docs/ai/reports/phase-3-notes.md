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
