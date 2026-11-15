# HOMI — single entry point for the local environment (master prompt §6.4, ADR-0008, ADR-0012).
# All targets delegate to scripts/dev/*.sh; run `make help`.

SHELL := /bin/bash
.DEFAULT_GOAL := help
DEV := scripts/dev

.PHONY: help dev-setup dev-start dev-stop dev-restart dev-status dev-logs dev-check dev-reset \
        dev-hosts dev-certs dev-nginx dev-nginx-restart dev-storage registry registry-check ci-backend ci-frontend e2e test-pgsql ai-sync ai-skills ai-hooks-test

help: ## Show targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

dev-setup: ## Fresh clone → running stack (brew deps, certs, nginx, hosts, storage, env files, migrate). Asks for sudo where needed
	@$(DEV)/setup.sh

dev-start: ## Start Horizon and the three Next.js dev servers (detached; logs in infra/local/logs)
	@$(DEV)/services.sh start

dev-stop: ## Stop Horizon and the Next.js dev servers (shared Homebrew services keep running)
	@$(DEV)/services.sh stop

dev-restart: ## Restart application processes
	@$(DEV)/services.sh restart

dev-status: ## Show application process status
	@$(DEV)/services.sh status

dev-logs: ## Tail all local logs (nginx vhosts, Horizon, Next)
	@$(DEV)/services.sh logs

dev-check: ## Health check: DNS, TLS, ports, API /up, DB + migrations, Horizon, CDN, version pins, .env key parity
	@$(DEV)/check.sh

dev-hosts: ## Write the managed homi.loc block into /etc/hosts (sudo)
	@$(DEV)/hosts.sh apply

dev-certs: ## Generate the mkcert certificate for *.homi.loc (and install the CA if not trusted; sudo)
	@$(DEV)/certs.sh generate
	@$(DEV)/certs.sh check >/dev/null 2>&1 || $(DEV)/certs.sh install

dev-nginx: ## Link vhosts, test and reload nginx (sudo for test/reload)
	@$(DEV)/nginx.sh link
	@$(DEV)/nginx.sh test
	@$(DEV)/nginx.sh reload

dev-nginx-restart: ## Test the config, then stop nginx (waits; fast shutdown if it hangs) and start a new master (sudo). Run from Terminal/iTerm (KI-31)
	@$(DEV)/nginx.sh test
	@$(DEV)/nginx.sh restart

dev-storage: ## Prepare the local media directory served by cdn.homi.loc
	@$(DEV)/storage.sh prepare

dev-reset: ## DESTRUCTIVE (local only): stop processes, drop run/log state, migrate:fresh. Asks for confirmation
	@read -r -p "This stops processes, clears infra/local/{run,logs} and runs 'php artisan migrate:fresh' on the LOCAL database. Type 'reset' to continue: " ans; \
	if [ "$$ans" = "reset" ]; then \
		$(DEV)/services.sh stop; \
		rm -f infra/local/run/*.pid infra/local/logs/*.log; \
		(cd backend && APP_ENV=$$(grep -E '^APP_ENV=' .env | cut -d= -f2) && [ "$$APP_ENV" = "local" ] && php artisan migrate:fresh --no-interaction || echo "refusing: APP_ENV is not local"); \
	else echo "aborted"; fi

registry: ## Regenerate the Composer package registry (after any composer.lock change)
	@scripts/packages/registry

registry-check: ## Verify the package registry matches composer.lock
	@scripts/packages/registry --check

ai-sync: ## Regenerate per-agent skill directories and Boost guidelines from the canonical .ai/skills (see .ai/README.md)
	@cd backend && php artisan boost:update --no-interaction

ai-skills: ## List the skills Boost knows about (official + vendored in .ai/skills)
	@cd backend && php artisan boost:list-skills --no-ansi

ai-hooks-test: ## Unit-test the agent hooks in .ai/hooks (path guard, session context, format-on-edit)
	@python3 -m unittest discover -s .ai/hooks/tests

ci-backend: ## Run the backend CI gate locally (Pint, PHPStan, Vite+ check, tsc, Pest)
	@cd backend && composer ci:check

ci-frontend: ## Run the frontend CI gate locally (generated API types, lint, typecheck, build, unit tests)
	@cd frontend && pnpm types:check && pnpm -r lint && pnpm -r typecheck && pnpm -r build && pnpm test

e2e: ## Run the Playwright suite (builds and starts app on :3001 unless E2E_BASE_URL is set)
	@cd frontend && pnpm test:e2e

# The pgsql group (backend/tests/Pgsql) needs a database whose name ends with _test: `createdb homi_test` once
# on the server of backend/.env, whose host and credentials are used; DB_HOST=… etc. on the command line win.
PGSQL_TEST_DATABASE ?= homi_test

test-pgsql: ## Run the backend pgsql test group against PGSQL_TEST_DATABASE (default homi_test)
	@cd backend && DB_CONNECTION=pgsql DB_DATABASE=$(PGSQL_TEST_DATABASE) php artisan test --compact --testsuite=Pgsql --fail-on-skipped
