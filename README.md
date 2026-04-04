# sealed.vote

Monorepo for the sealed.vote backend, frontend, shared protocol packages, and end-to-end tests.

## workspace layout

- `apps/server` fastify backend
- `apps/web` react frontend
- `packages/contracts` shared request and response contracts
- `packages/protocol` shared voting protocol and crypto helpers
- `packages/testkit` shared backend and e2e test helpers

## local development

```bash
pnpm install
pnpm docker:reset
pnpm db:reset
pnpm dev
```

## verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

## documentation

- [docs/endpoints.md](./docs/endpoints.md) for the current backend api
- [docs/voting.md](./docs/voting.md) for the protocol and phase model
- [docs/deployment.md](./docs/deployment.md) for netlify and server artifact deployment
