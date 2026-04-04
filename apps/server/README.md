# sealed.vote server

Backend workspace for the sealed.vote application.

## Workspace usage

Run the monorepo from the repository root:

```bash
pnpm install
pnpm local:reset
pnpm --filter @sealed-vote/server dev
```

Use `pnpm local:reset` when you want the full local docker and database reset in one command. `pnpm db:setup` remains available if the containers are already running. The seed data is for local manual checks and is not required for CI or automated tests.

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
