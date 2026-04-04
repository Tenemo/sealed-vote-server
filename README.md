# sealed.vote

Monorepo for the sealed.vote backend, frontend, shared protocol packages, and end-to-end tests.

## Workspace layout

- `apps/server` Fastify backend
- `apps/web` React frontend
- `packages/contracts` shared API contracts
- `packages/protocol` shared voting protocol helpers
- `packages/testkit` shared test helpers

## Development

```bash
pnpm install
pnpm docker:reset
pnpm db:reset
pnpm dev
```
