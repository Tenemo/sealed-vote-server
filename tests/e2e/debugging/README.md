# Production e2e debugging

This directory packages the production-only Playwright debugging workflow into a repeatable container setup.

Use it when a production e2e failure reproduces only on GitHub-hosted Linux or only against `https://sealed.vote`.

## What it does

- runs inside the same Playwright image family used by GitHub Actions
- sets the same production-oriented Playwright env flags by default
- copies a trimmed snapshot of the repo into a writable container workdir before `pnpm install`
- persists the pnpm store in a Docker volume so reruns are much faster
- copies `test-results`, `blob-report`, and `playwright-report` back into `test-results/debugging-container/<timestamp>/`

The copy step is intentional. It avoids bind-mount write issues during Linux `pnpm install`, especially on Windows hosts.

## One-command usage

Run the production-targeted browser flow in the debug container:

```bash
pnpm e2e:debug:production -- tests/e2e/ceremony-persistence.spec.ts --project firefox-desktop
```

Capture production edge diagnostics without launching Playwright:

```bash
pnpm e2e:production:diagnostics -- --output-dir production-diagnostics
```

Repeat a narrowed production repro:

```bash
pnpm e2e:debug:production -- tests/e2e/ceremony-persistence.spec.ts --project firefox-desktop --grep=rejoins --repeat-each=10
```

Open an interactive shell after the repo snapshot and install:

```bash
pnpm e2e:debug:shell
```

Run an arbitrary command inside the prepared container:

```bash
pnpm e2e:debug:command -- pnpm test
```

## Default environment

The compose setup defaults to:

- `CI=true`
- `HOME=/root`
- `PLAYWRIGHT_BASE_URL=https://sealed.vote`
- `PLAYWRIGHT_BLOB_REPORT=true`
- `PLAYWRIGHT_CI_WORKERS=1`
- `PLAYWRIGHT_PRODUCTION_ISOLATE_BY_FILE=true`
- `PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS=true`
- `PLAYWRIGHT_NAVIGATION_TIMEOUT_MS=45000`

Override them from the host shell if needed before running the debug command.

The diagnostics script records:

- repeated GET and OPTIONS probes for `sealed.vote` and `api.sealed.vote`
- response headers and truncated response bodies
- DNS lookup results for the production hosts
- best-effort public IP discovery from common external echo services
- GitHub Actions and runner environment metadata when invoked in CI

## Artifacts

Each run writes artifacts to:

```text
test-results/debugging-container/<timestamp>/
```

The most recent artifact directory is also written to:

```text
test-results/debugging-container/last-run.txt
```
