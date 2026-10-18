# Architecture and verified scope

## What this repository is

This is a web application repository with static HTML/CSS/JavaScript pages and an unverified Node.js API foundation. It is not an operating system, execution kernel, blockchain protocol, or production DeFi system. Marketing pages contain historical mock content and must not be treated as evidence of deployed services, balances, performance, security controls, AI capabilities, or on-chain activity.

## Implemented source

- `src/` contains a Fastify API draft for readiness, Auth0 OIDC sessions, workspace scoped mission reads/writes and event creation.
- `database/migrations/` and `database/schema.sql` describe an initial PostgreSQL model. The migration has not been run in this workspace and has not been verified against PostgreSQL here.
- `api/openapi.yaml` is a draft API contract. Contract conformance has not been exercised.
- `config/chain.config.js` hard disables chain integration. No wallet connector, RPC client, contract, signer, token operation, payment, or value transfer is implemented.
- `config/app.example.json` keeps payment, AI, CRM, automation and DSN flags disabled. Mission Control refers only to the API draft, not a deployed product.

The npm registry could not be resolved during the last installation attempt. Dependencies and `package-lock.json` are absent; API tests that import Fastify cannot currently run. The native Node unit tests and static checks do not establish backend readiness.

## Module boundaries

1. `src/config.js`: environment parsing and fail-closed production requirements.
2. `src/app.js`: HTTP routes and authentication/session integration; split further into plugins, routes and repositories before material growth.
3. `src/authorization.js`: role permissions and mission state transitions.
4. `database/migrations/`: versioned persistence changes, applied only through an explicit operator command.
5. `services/`: optional integrations. They remain disabled and must expose their configuration state rather than pretend work succeeded.
6. Static pages: presentation only. They must label absent integrations and must not fabricate operational or financial state.

## Security boundaries

- Workspace membership must be checked for every workspace resource. SQL values are parameterized; integration tests are still required to verify tenant isolation.
- OIDC is fail-closed in production configuration, but the complete login/database path has not been tested with a provider or PostgreSQL.
- No key custody or secret collection is in scope. Never request or store seed phrases or private keys.
- All chain, payment, staking, lending, swap, bridge, mint, burn, and transfer functions remain off.

## Next stages

1. **Offline truth and structure:** accurate status labels, remove fake data and inactive controls, define module contracts and tests.
2. **Reproducible backend verification:** resolve dependencies when registry access is restored; generate a lockfile; test against disposable local PostgreSQL and mock/staging OIDC.
3. **Workspace product:** complete membership administration, audit policy, API contract tests and UI integration only after security review.
4. **Separate chain evaluation:** follow `WEB3_EVALUATION_PLAN.md`. No network or contract is selected or activated by this architecture document.

Each stage requires its own review. Passing local static tests is not production readiness.
