# sealed.vote

[![Netlify Status](https://api.netlify.com/api/v1/badges/431089b8-8373-4038-8b80-fb3a7aa02c6e/deploy-status)](https://app.netlify.com/projects/sealed-vote/deploys)
[![API status](https://img.shields.io/website?url=https%3A%2F%2Fapi.sealed.vote%2Fapi%2Fhealth-check&label=api%20status&style=flat&labelColor=545A61&color=BEF9C6)](https://api.sealed.vote/api/health-check)

---

[![Production E2E tests](https://img.shields.io/github/actions/workflow/status/Tenemo/sealed-vote/production-e2e.yml?branch=master&label=production%20e2e&style=flat&labelColor=545A61&color=BEF9C6)](https://github.com/Tenemo/sealed-vote/actions/workflows/production-e2e.yml)
[![CI](https://img.shields.io/github/actions/workflow/status/Tenemo/sealed-vote/ci.yml?branch=master&label=ci&style=flat&labelColor=545A61&color=BEF9C6)](https://github.com/Tenemo/sealed-vote/actions/workflows/ci.yml)
[![Tests coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Tenemo/sealed-vote/badge-data/coverage.json&style=flat&labelColor=545A61)](https://github.com/Tenemo/sealed-vote/actions/workflows/readme-badges.yml)

---

[![Node version](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Tenemo/sealed-vote/badge-data/node.json)](./.nvmrc)
[![License](https://img.shields.io/github/license/Tenemo/sealed-vote)](./LICENSE)

---

[sealed.vote](https://sealed.vote) is a browser-based 1-10 score voting application built around `threshold-elgamal` `1.0.0-beta.6`. It uses a public roster, an append-only bulletin-board-style log, and local verification so that voters can audit who is participating while keeping ballot contents confidential.

https://github.com/user-attachments/assets/f4334c3c-1781-462c-9f0e-3e7ccda372f1

## Overview

- `apps/web` React and Vite frontend
- `apps/api` Fastify API backed by PostgreSQL
- `packages/contracts` shared request and response contracts
- `packages/protocol` shared poll phase, tallying, and crypto helpers
- `packages/testkit` shared backend and e2e test helpers
- `tests/e2e` Playwright browser tests

The frontend and backend both rely on [`threshold-elgamal`](https://www.npmjs.com/package/threshold-elgamal), a TypeScript cryptography library used for the board ceremony, threshold encryption workflow, and local verification.

## How it works

1. A poll creator opens a score vote and shares its slug-based URL.
2. Voters join the waiting room with public names and receive voter-specific tokens.
3. Once at least three participants are registered, the creator starts voting and the roster becomes fixed.
4. The client signs and appends protocol payloads to the board log behind guided UI actions. The board is append-only and every message is classified as accepted, idempotent, or equivocation.
5. The public read model derives ceremony phase, digests, manifest state, and verification status only from the ordered board entries.
6. The current app completes the open waiting room, manifest freeze, and manifest-acceptance flow. The later DKG, ballot, and result-opening steps still depend on proof and VSS authoring helpers that are not yet exported from the library root entrypoint.

This repository currently targets a hardened research prototype, not audited production voting software.

See [docs/voting.md](./docs/voting.md) for the board ceremony model, and [docs/endpoints.md](./docs/endpoints.md) for the current API surface.

## Tech stack

- Frontend: TypeScript, React, Redux Toolkit, Tailwind CSS, shadcn/ui, Vite, Vitest
- Backend: TypeScript, Fastify, Drizzle ORM, PostgreSQL, Vitest
- Tooling: pnpm workspaces, Turborepo, Playwright, ESLint, stylelint (web app)

## Offline and reconnect recovery

Offline and reconnect recovery is a core feature of the app, not a best-effort extra.

- The browser persists only narrow local session state: creator tokens, voter tokens, voter indices, and poll references needed to reconnect to the same ceremony.
- On reopen, the app refetches the public read model and board log from the API instead of restoring cached poll snapshots from a service worker.
- Board message retransmissions are safe because the backend classifies identical unsigned payloads as idempotent, even when the signatures differ.
- The current UI does not persist plaintext ballots or scores at rest.

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

## Workspace documentation

- [apps/api/README.md](./apps/api/README.md) for API workspace
- [apps/web/README.md](./apps/web/README.md) for frontend workspace
- [docs/endpoints.md](./docs/endpoints.md) for endpoint documentation
- [docs/voting.md](./docs/voting.md) for the voting protocol

## License

This repository is licensed under AGPL-3.0-only. See [LICENSE](./LICENSE) for the full text.
