# sealed.vote

[![Netlify Status](https://api.netlify.com/api/v1/badges/431089b8-8373-4038-8b80-fb3a7aa02c6e/deploy-status)](https://app.netlify.com/projects/sealed-vote/deploys)

[sealed.vote](https://sealed.vote) is a browser-based ranked-choice voting application built around homomorphic encryption. Voters score each choice from 1 to 10, and the system is designed so that individual votes remain hidden from everyone, including the server, while the final tally can still be computed.

https://github.com/user-attachments/assets/f4334c3c-1781-462c-9f0e-3e7ccda372f1

## Overview

- `apps/web` React and Vite frontend
- `apps/api` Fastify API backed by PostgreSQL
- `packages/contracts` shared request and response contracts
- `packages/protocol` shared poll phase, tallying, and crypto helpers
- `packages/testkit` shared backend and e2e test helpers
- `tests/e2e` Playwright browser tests

The frontend and backend both rely on [`threshold-elgamal`](https://www.npmjs.com/package/threshold-elgamal), a TypeScript cryptography library used for the encrypted voting flow.

## How it works

1. A poll creator opens a poll and shares it with voters.
2. Voters register and receive voter-specific tokens.
3. Once registration closes, each voter generates a keypair and submits a public key share.
4. After all shares are present, voters encrypt their scores locally and submit only ciphertexts.
5. The backend combines encrypted votes into encrypted tallies.
6. Voters submit decryption shares so the final aggregate result can be revealed without exposing individual ballots.

See [docs/voting.md](./docs/voting.md) for the protocol and phase model, and [docs/endpoints.md](./docs/endpoints.md) for the current API surface.

## Tech stack

- Frontend: TypeScript, React, Redux Toolkit, Material UI, Vite, Vitest
- Backend: TypeScript, Fastify, Drizzle ORM, PostgreSQL, Vitest
- Tooling: pnpm workspaces, Turborepo, Playwright, ESLint, stylelint

## Local development

### Requirements

- Node.js `>=24.14.1`
- `pnpm@10.33.0`
- Docker Desktop or another Docker engine with Compose support

### Running the full stack

From the repository root:

```bash
pnpm install
pnpm local:reset
pnpm dev
```

`pnpm local:reset` recreates the Docker services, resets the database, and seeds local sample data in one step.

The default local setup serves:

- the web app at `http://127.0.0.1:3000`
- the API at `http://127.0.0.1:4000`

## End-to-end testing

Run the guarded Playwright suite from the repository root:

```bash
pnpm e2e
```

Locally, Playwright now uses multiple workers by default. Override that with `PLAYWRIGHT_WORKERS` when you want a different level of parallelism.

The e2e entrypoint refuses to run unless all of these are true:

- `NODE_ENV=test`
- `DATABASE_URL` points at the local or CI Postgres `sv-db`
- `VITE_API_BASE_URL`, if set, points at a local HTTP backend

The suite resets the database before starting the shared backend and web dev servers, so it must never be able to target a production or remote environment.

## Workspace documentation

- [apps/api/README.md](./apps/api/README.md) for API workspace
- [apps/web/README.md](./apps/web/README.md) for frontend workspace
- [docs/endpoints.md](./docs/endpoints.md) for endpoint documentation
- [docs/voting.md](./docs/voting.md) for the voting protocol

## License

This repository is licensed under AGPL-3.0-only. See [LICENSE](./LICENSE) for the full text.
