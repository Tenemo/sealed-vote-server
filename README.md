# sealed.vote

[![CI](https://img.shields.io/github/actions/workflow/status/Tenemo/sealed-vote/ci.yml?branch=master&label=ci)](https://github.com/Tenemo/sealed-vote/actions/workflows/ci.yml)
[![Production e2e](https://img.shields.io/github/actions/workflow/status/Tenemo/sealed-vote/production-e2e.yml?branch=master&label=production%20e2e)](https://github.com/Tenemo/sealed-vote/actions/workflows/production-e2e.yml)
[![Web deploy](https://img.shields.io/github/deployments/Tenemo/sealed-vote/sealed.vote%20%2F%20production?label=web%20deploy&logo=railway&logoColor=white)](https://github.com/Tenemo/sealed-vote/deployments/activity_log?environments_filter=sealed.vote+%2F+production)
[![API deploy](https://img.shields.io/github/deployments/Tenemo/sealed-vote/sealed-vote-preview%20%2F%20production?label=api%20deploy&logo=railway&logoColor=white)](https://github.com/Tenemo/sealed-vote/deployments/activity_log?environments_filter=sealed-vote-preview+%2F+production)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Tenemo/sealed-vote/badge-data/coverage.json)](https://github.com/Tenemo/sealed-vote/actions/workflows/readme-badges.yml)
[![Node version](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Tenemo/sealed-vote/badge-data/node.json)](./.nvmrc)

---

[![License](https://img.shields.io/github/license/Tenemo/sealed-vote)](./LICENSE)

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

## Offline and reconnect recovery

Offline and reconnect recovery is a core feature of the app, not a best-effort extra.

- In-progress voting workflow state is persisted in the browser through `redux-persist`, including the current poll snapshot, selected scores, creator token, confirmed voter session, and pending registration intent when a registration response is lost.
- The persisted state is sanitized on completion so finished polls no longer keep sensitive material such as private keys, voter tokens, or selected scores.
- In production, the custom service worker caches the app shell plus any poll payloads the browser has already fetched. That allows previously visited polls to reopen from cached data while the network is unavailable.
- `RecoveryCoordinator` runs in the background after startup, on window focus, and when the browser comes back online. It resumes creator sessions, confirmed voter sessions, and pending voter registrations without requiring the user to restart the flow manually.
- Recovery is safe because the backend routes are deliberately idempotent where needed. Poll creation, voter registration, poll close, public key share submission, vote submission, and decryption share submission can all be retried after a lost response without duplicating state or changing the result unexpectedly.

The Playwright suite covers the recovery model directly:

- [`tests/e2e/refresh-resume.spec.ts`](./tests/e2e/refresh-resume.spec.ts) verifies that a persisted voter session survives a browser refresh and still reaches completion.
- [`tests/e2e/polling-offline.spec.ts`](./tests/e2e/polling-offline.spec.ts) verifies that the UI stays usable across disconnects before and after the vote starts, and that background polling recovers cleanly.
- [`tests/e2e/recovery-network-cuts.spec.ts`](./tests/e2e/recovery-network-cuts.spec.ts) verifies safe replay after post-commit response loss for create, register, close, public key share, vote, and decryption share requests.
- [`tests/e2e/recovery-network-cuts.spec.ts`](./tests/e2e/recovery-network-cuts.spec.ts) also verifies that a previously visited poll can reopen from persisted local data when live poll fetches fail.
- [`tests/e2e/voting-flow.spec.ts`](./tests/e2e/voting-flow.spec.ts) covers the normal happy path and asserts that completed polls show locally verified published results.

## Social previews

- The root page ships a full static SEO block with canonical, Open Graph, Twitter, and JSON-LD metadata.
- Vote links publish route-specific HTML metadata before JavaScript runs. Share unfurls for `/votes/<slug>` use the exact vote title in the page title, Open Graph title, Twitter title, canonical URL, structured data, and a vote-specific PNG preview at `/social/votes/<slug>.png`.
- Vote preview images are rendered lazily from the poll title and first choices while the vote is still open, then switch to a versioned results image after completion so newly shared links can show the final ranking without breaking CDN caching for already-shared live previews.
- The per-vote image responses are cached aggressively through the Netlify CDN with durable caching so repeated shares of the same vote state do not keep regenerating the image.
- The same metadata and image rendering logic is used for the static app shell, the client-side route updates, the Railway built-preview server, the Netlify `/votes/*` edge path, and the Netlify `/social/votes/:slug.png` function so previews stay consistent across environments.

## Tech stack

- Frontend: TypeScript, React, Redux Toolkit, Tailwind CSS, shadcn/ui, Vite, Vitest
- Backend: TypeScript, Fastify, Drizzle ORM, PostgreSQL, Vitest
- Tooling: pnpm workspaces, Turborepo, Playwright, ESLint, stylelint (web app)

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

The e2e entrypoint refuses to run unless all of these are true:

- `NODE_ENV=test`
- `DATABASE_URL` points at the local or CI Postgres `sv-db`
- `VITE_API_BASE_URL`, if set, points at a local HTTP backend

The suite resets the database before starting the shared backend and web dev servers, so it must never be able to target a production or remote environment.

GitHub Actions uses a separate built-artifact path for PR e2e runs:

- `pnpm e2e:ci:build` builds the API and web artifacts once
- `pnpm e2e:ci:serve:api` starts the built API server
- `pnpm e2e:ci:serve:web` starts the built web server
- `pnpm e2e:ci:test` runs Playwright against the built API and built web server

Production e2e uses a separate remote-safe path:

- `pnpm e2e:production:wait -- --commit <sha> --web https://sealed.vote --api https://api.sealed.vote` waits until the deployed frontend and API both serve the target commit SHA
- `PLAYWRIGHT_BASE_URL=https://sealed.vote pnpm e2e:production:test` runs the same Playwright suite against the deployed site without starting local servers or touching the local database

Netlify deploy previews are configured to point at the production API:

- `netlify.toml` sets `VITE_API_BASE_URL=https://api.sealed.vote` for the `deploy-preview` context
- the API CORS policy allows `https://deploy-preview-<number>--sealed-vote.netlify.app`
- this gives PR preview frontend builds without trying to provision a matching preview backend

## Workspace documentation

- [apps/api/README.md](./apps/api/README.md) for API workspace
- [apps/web/README.md](./apps/web/README.md) for frontend workspace
- [docs/endpoints.md](./docs/endpoints.md) for endpoint documentation
- [docs/voting.md](./docs/voting.md) for the voting protocol

## License

This repository is licensed under AGPL-3.0-only. See [LICENSE](./LICENSE) for the full text.
