# deployment

The monorepo no longer hardcodes a production backend host inside the frontend bundle. The web app should be built with `VITE_API_BASE_URL` set to the backend origin.

## frontend

- Netlify configuration lives in `apps/web/netlify.toml`
- build command: `pnpm turbo run build --filter=@sealed-vote/web`
- publish directory: `apps/web/dist`
- required environment variables:
- `VITE_API_BASE_URL=https://your-backend.example.com`

The only redirect kept in `apps/web/public/_redirects` is the single-page-app fallback to `index.html`.

## backend

- `apps/server/Procfile` starts the built server with `node dist/server.js`
- `.github/workflows/server-artifact.yml` builds a deployable artifact for the server plus shared runtime packages
- required environment variables:
- `DATABASE_URL`
- `NODE_ENV`
- `PORT`
- `LOG_LEVEL`

## ci

- `.github/workflows/ci.yml` installs the monorepo with pnpm, resets the database, runs lint, typecheck, stylelint, tests, build, and browser e2e
- the workflow uses PostgreSQL 16.2 and Node from the root `.nvmrc`

## local smoke path

```bash
pnpm install
pnpm local:reset
pnpm dev
```

`pnpm local:reset` is the full local reset shortcut that recreates docker services and rebuilds plus seeds the database. CI and Playwright should continue using `pnpm db:reset` only.

## note on platform wiring

The repository now contains the monorepo-aware build configuration, but the final deployment target and secrets still have to be configured on the chosen hosting platforms. That part cannot be completed from source control alone.
