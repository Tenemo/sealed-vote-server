# sealed.vote server

Backend workspace for the sealed.vote application.

## Workspace usage

Run the monorepo from the repository root:

```bash
pnpm install
pnpm docker:up
pnpm db:reset
pnpm --filter @sealed-vote/server dev
```

To run the full stack together from the root:

```bash
pnpm dev
```

## App commands

From the repository root:

```bash
pnpm --filter @sealed-vote/server lint
pnpm --filter @sealed-vote/server typecheck
pnpm --filter @sealed-vote/server test
pnpm --filter @sealed-vote/server build
```

Canonical docs live at [../../docs/endpoints.md](../../docs/endpoints.md) and [../../docs/deployment.md](../../docs/deployment.md).
