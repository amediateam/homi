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
