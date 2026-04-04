# sealed.vote server

Backend workspace for the sealed.vote application.

## Workspace usage

Run the monorepo from the repository root:

```bash
pnpm install
pnpm docker:up
pnpm db:reset
pnpm db:seed
pnpm --filter @sealed-vote/server dev
```

Use `pnpm db:setup` if you want the reset and seed steps together. The seed data is for local manual checks and is not required for CI or automated tests.

To run the full stack together from the root:

```bash
pnpm dev
```

## App commands

From the repository root:

```bash
pnpm --filter @sealed-vote/server db:generate
pnpm --filter @sealed-vote/server db:migrate
pnpm --filter @sealed-vote/server lint
pnpm --filter @sealed-vote/server typecheck
pnpm --filter @sealed-vote/server test
pnpm --filter @sealed-vote/server build
```

Canonical docs live at [../../docs/endpoints.md](../../docs/endpoints.md) and [../../docs/deployment.md](../../docs/deployment.md).
