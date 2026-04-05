# sealed.vote

Monorepo for the sealed.vote backend, frontend, shared protocol packages, and end-to-end tests.

## License

This repository is licensed under AGPL-3.0-only. See the top-level `LICENSE` file for the full text.

## Workspace layout

- `apps/api` fastify backend API
- `apps/web` react frontend
- `packages/contracts` shared request and response contracts
- `packages/protocol` shared voting protocol and crypto helpers
- `packages/testkit` shared backend and e2e test helpers

## Local development

```bash
pnpm install
pnpm local:reset
pnpm dev
```

Use `pnpm local:reset` to recreate docker services, rebuild the database, and seed local sample data in one step. `pnpm db:setup` is still available when the containers are already running.

## Verification

```bash
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

## Documentation

- [docs/endpoints.md](./docs/endpoints.md) for the current backend API
- [docs/voting.md](./docs/voting.md) for the protocol and phase model
- [docs/deployment.md](./docs/deployment.md) for Netlify, Railway, and API artifact deployment
