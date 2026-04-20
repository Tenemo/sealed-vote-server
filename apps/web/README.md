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

The frontend only needs one user-configured environment variable: `VITE_API_BASE_URL` for deployments that talk to the backend on a different origin. Local development does not need it because Vite proxies `/api` to the backend dev server.

On Netlify production and deploy preview hosts, the browser uses `VITE_API_BASE_URL` directly. On the `legacy/elgamal` branch that means the live frontend talks straight to `https://api.elgamal.sealed.vote` instead of going through the Netlify `/api` passthrough path. Server-side SEO helpers still resolve their own API base URL independently.

When serving built frontend assets behind a proxy or preview domain, you can
also set `SEO_PUBLIC_ORIGIN` so request-aware canonical, Open Graph, and
Twitter URLs use a trusted public origin instead of request headers. For the
legacy deployment that value should be `https://elgamal.sealed.vote`.

For deployed static serving outside Vite, the workspace also provides:

```bash
pnpm --filter @sealed-vote/web serve:dist
```

That command serves `dist` with SPA fallback, injects route-aware SEO
metadata into poll pages, serves per-poll social preview PNGs at
`/social/polls/<slug>.png`, switches those images to a results layout once a
poll is complete, and is used by the Railway preview web service.
