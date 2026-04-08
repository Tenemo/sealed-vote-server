# sealed.vote web

Frontend workspace for the sealed.vote application.

## Workspace usage

Run the monorepo from the repository root:

```bash
pnpm install
pnpm local:reset
pnpm --filter @sealed-vote/web dev
```

`pnpm local:reset` recreates docker services and rebuilds plus seeds the local database. `pnpm db:seed` is still optional and only useful when you want sample polls for manual local testing without resetting the database first.

To run the full stack together from the root:

```bash
pnpm dev
```

## App commands

From the repository root:

```bash
pnpm --filter @sealed-vote/web lint
pnpm --filter @sealed-vote/web stylelint
pnpm --filter @sealed-vote/web typecheck
pnpm --filter @sealed-vote/web test
pnpm --filter @sealed-vote/web build
```

The frontend only needs one user-configured environment variable: `VITE_API_BASE_URL` for deployed builds that talk to the backend on a different origin. Local development does not need it because Vite proxies `/api` to the backend dev server.

When serving built frontend assets behind a proxy or preview domain, you can
also set `SEO_PUBLIC_ORIGIN` so request-aware canonical, Open Graph, and
Twitter URLs use a trusted public origin instead of request headers.

For deployed static serving outside Vite, the workspace also provides:

```bash
pnpm --filter @sealed-vote/web serve:dist
```

That command serves `dist` with SPA fallback, injects route-aware SEO
metadata into vote pages, serves per-vote social preview PNGs at
`/social/votes/<slug>.png`, switches those images to a results layout once a
vote is complete, and is used by the Railway preview web service.
