# ZDOS web platform — current repository status

This repository contains a collection of static HTML pages and an **unverified backend draft**. It is not an operating system, a production service, or a production DeFi protocol. Some legacy pages previously displayed fabricated balances, mining, uptime, AI and chain activity. They are being relabeled as disabled or unconfigured; such page content is not evidence of real services.

## What is present

- Static site pages in the repository root.
- A Node.js/Fastify API draft in `src/` for readiness, OIDC session handling, workspace scoped missions and events.
- A PostgreSQL schema and initial migration under `database/`.
- A draft OpenAPI contract in `api/openapi.yaml`.
- Feature switches in `config/app.example.json`; chain integration is hard-disabled in `config/chain.config.js`.
- Native Node unit tests and static smoke checks.

The backend dependencies have not been installed because the npm registry DNS lookup has failed. There is no lockfile yet. The API, migrations, authentication flow and workspace isolation have not been validated end-to-end. Any API route described here is code in a draft, not a running or production-ready service.

## Current safety state

Auth0 and PostgreSQL are environment-configured, but must be supplied before the backend can become ready. Production configuration fails closed when required values are absent. This repository does not contain those credentials. Do not add credentials, private keys or seed phrases to source control. The app does not need or accept seed phrases.

Mainnet, payments, custody, staking, lending, swaps, bridges, mint, burn, and value transfers are disabled and out of scope. There is no configured chain, wallet, RPC, token contract or on-chain audit. See [the separate Web3 evaluation plan](docs/WEB3_EVALUATION_PLAN.md); it does not authorize a connection or implementation.

## Local checks

Use Node.js 22 or 24. Dependency-free checks can run with:

```sh
node --test tests/unit.test.js tests/static-status.test.js
bash tests/smoke.sh
```

`npm test` also loads the Fastify application test, so it requires the declared dependencies. At present they cannot be installed due to npm registry DNS failure; a blocked test is not a pass. PostgreSQL and Auth0 integration tests require separately provisioned disposable test services and are not run here.

When npm access is available, resolve dependencies normally, generate and review `package-lock.json`, and install without package lifecycle scripts for initial verification:

```sh
npm install --ignore-scripts --no-audit --no-fund
npm test
```

Database migration commands connect to the `DATABASE_URL` in the operator environment. They are intentionally not part of local smoke checks and must only be used with a disposable local database unless separately authorized.

## Architecture and roadmap

See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP_MVP.md), and [Web3 evaluation plan](docs/WEB3_EVALUATION_PLAN.md). The near-term work is truth-in-interface, reproducible dependencies, modular backend boundaries, and isolated verification. No deployment or external integration is implied.
