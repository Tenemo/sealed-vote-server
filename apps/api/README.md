# sealed.vote API

API workspace for the sealed.vote application.

## Workspace usage

Run the monorepo from the repository root:

```bash
pnpm install
pnpm local:reset
pnpm --filter @sealed-vote/api dev
```

Use `pnpm local:reset` when you want the full local docker and database reset in one command. `pnpm db:setup` remains available if the containers are already running. The seed data is for local manual checks and is not required for CI or automated tests.

The API needs `DATABASE_URL` for the database connection. It can also take `WEB_APP_ORIGIN` when the deployed frontend is not one of the built-in allowed origins such as `https://sealed.vote` or the Netlify deploy-preview domain pattern. Local development defaults to the local docker database when `DATABASE_URL` is not set. Railway should provide `PORT`; otherwise the server defaults to `4000`.

To run the full stack together from the root:

```bash
pnpm dev
```

## App commands

From the repository root:

```bash
pnpm --filter @sealed-vote/api db:generate
pnpm --filter @sealed-vote/api db:migrate
pnpm --filter @sealed-vote/api lint
pnpm --filter @sealed-vote/api typecheck
pnpm --filter @sealed-vote/api test
pnpm --filter @sealed-vote/api build
```
