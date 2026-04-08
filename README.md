# sealed.vote

[![Web status](https://img.shields.io/website?url=https%3A%2F%2Fsealed.vote&label=web%20status)](https://sealed.vote)
[![API status](https://img.shields.io/website?url=https%3A%2F%2Fapi.sealed.vote%2Fapi%2Fhealth-check&label=api%20status)](https://api.sealed.vote/api/health-check)

---

[![Production e2e](https://img.shields.io/github/actions/workflow/status/Tenemo/sealed-vote/production-e2e.yml?branch=master&label=production%20e2e)](https://github.com/Tenemo/sealed-vote/actions/workflows/production-e2e.yml)
[![CI](https://img.shields.io/github/actions/workflow/status/Tenemo/sealed-vote/ci.yml?branch=master&label=ci)](https://github.com/Tenemo/sealed-vote/actions/workflows/ci.yml)
[![Tests coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Tenemo/sealed-vote/badge-data/coverage.json)](https://github.com/Tenemo/sealed-vote/actions/workflows/readme-badges.yml)

---

[![Node version](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Tenemo/sealed-vote/badge-data/node.json)](./.nvmrc)
[![License](https://img.shields.io/github/license/Tenemo/sealed-vote)](./LICENSE)

---

[sealed.vote](https://sealed.vote) is a browser-based 1-10 score voting application built around homomorphic encryption. Voters score each choice from 1 to 10, and the system is designed so that individual votes remain hidden from everyone, including the server, while the final tally can still be computed.

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
7. Once the poll is complete, the backend publishes the raw plaintext tally products, the rounded geometric-mean scores, and the ordered decryption shares used to reveal them.
8. The frontend verifies the published results locally before showing the final ranking.

See [docs/voting.md](./docs/voting.md) for the protocol and phase model, and [docs/endpoints.md](./docs/endpoints.md) for the current API surface.

## Tech stack

- Frontend: TypeScript, React, Redux Toolkit, Tailwind CSS, shadcn/ui, Vite, Vitest
- Backend: TypeScript, Fastify, Drizzle ORM, PostgreSQL, Vitest
- Tooling: pnpm workspaces, Turborepo, Playwright, ESLint, stylelint (web app)

## Offline and reconnect recovery

Offline and reconnect recovery is a core feature of the app, not a best-effort extra.

- In-progress voting workflow state is persisted in the browser through `redux-persist`, including the current poll snapshot, selected scores, creator token, confirmed voter session, and pending registration intent when a registration response is lost.
- The persisted state is sanitized on completion so finished polls no longer keep sensitive material such as private keys, voter tokens, or selected scores.
- In production, the custom service worker caches the app shell plus any poll payloads the browser has already fetched. That allows previously visited polls to reopen from cached data while the network is unavailable.
- `RecoveryCoordinator` runs in the background after startup, on window focus, and when the browser comes back online. It resumes creator sessions, confirmed voter sessions, and pending voter registrations without requiring the user to restart the flow manually.
- Recovery is safe because the backend routes are deliberately idempotent where needed. Poll creation, voter registration, poll close, public key share submission, vote submission, and decryption share submission can all be retried after a lost response without duplicating state or changing the result unexpectedly.

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
