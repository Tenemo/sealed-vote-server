# Deployment

Production is split across Netlify and Railway:

- frontend hosting and DNS stay on Netlify
- backend API runs on Railway
- PostgreSQL runs on Railway

## Frontend

- Netlify configuration lives in `apps/web/netlify.toml`
- build command: `pnpm turbo run build --filter=@sealed-vote/web`
- publish directory: `apps/web/dist`
- production environment variable: `VITE_API_BASE_URL=https://api.sealed.vote`

Leave `VITE_API_BASE_URL` empty in local `.env` files so Vite continues proxying `/api` to `http://127.0.0.1:4000` during local development.

The only redirect kept in `apps/web/public/_redirects` is the single-page-app fallback to `index.html`.

## Backend

- Railway configuration lives in the repo root `railway.toml`
- Railway service root directory should remain `/`, not `apps/server`
- build command: `pnpm turbo run build --filter=@sealed-vote/server`
- start command: `pnpm --filter @sealed-vote/server start`
- pre-deploy migration: `pnpm --filter @sealed-vote/server db:migrate`
- health check path: `/api/health-check`
- required Railway variables:
  - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
  - `NODE_ENV=production`
  - `LOG_LEVEL=info`
  - `HOST=::`

Keep `RAILPACK_PRUNE_DEPS` unset or false. The migration command depends on dev tools that must remain available at deploy time.

Recommended Railway watch paths for the backend service:

- `/apps/server/**`
- `/packages/contracts/**`
- `/packages/protocol/**`
- `/packages/testkit/**`
- `/package.json`
- `/pnpm-workspace.yaml`
- `/.nvmrc`
- `/.npmrc`
- `/pnpm-lock.yaml`
- `/turbo.json`

`apps/server/Procfile` and `.github/workflows/server-artifact.yml` are still kept during the rollback window for the Heroku deployment path.

## Database and cutover

- provision a Railway PostgreSQL 16 service named `Postgres`
- deploy the Railway API against a fresh Railway database first
- confirm the pre-deploy migration succeeds and `GET /api/health-check` returns `{ "service": "OK", "database": "OK" }`
- rehearse a restore from a recent Heroku backup into Railway before the production cutover
- during cutover, enable Heroku maintenance, take one final backup, restore it into Railway, switch `api.sealed.vote` to Railway, update Netlify `VITE_API_BASE_URL`, and redeploy the frontend

Keep the Heroku app, Heroku Postgres, and the final logical dump for 7 days after cutover to preserve a fast rollback path.

## CI and verification

- `.github/workflows/ci.yml` installs the monorepo with pnpm, resets PostgreSQL 16.2, runs lint, typecheck, stylelint, tests, build, and browser e2e
- `.github/workflows/server-artifact.yml` still builds the Heroku-style server artifact during the rollback window
- pre-merge verification for Railway changes:
  - `pnpm turbo run build --filter=@sealed-vote/server`
  - `pnpm --filter @sealed-vote/server test`

`pnpm e2e` is currently failing because of a pre-existing browser session-storage issue in the frontend. Treat that as separate from the Railway migration.

## Local smoke path

```bash
pnpm install
pnpm local:reset
pnpm dev
```

`pnpm local:reset` recreates docker services and rebuilds plus seeds the database. CI and Playwright should continue using `pnpm db:reset` only.
