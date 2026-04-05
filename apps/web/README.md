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
pnpm --filter @sealed-vote/web typecheck
pnpm --filter @sealed-vote/web test
pnpm --filter @sealed-vote/web build
```

For deployed builds, set `VITE_API_BASE_URL` to the backend origin. Local development does not need it because Vite proxies `/api` to the backend dev server.
