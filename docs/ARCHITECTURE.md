# Architecture and verified scope

## What this repository is

This is a Fastify-served web shell with static HTML/CSS/JavaScript pages, an installable offline shell and an API foundation. It is not an operating system, execution kernel, blockchain protocol, or production DeFi system. Pages that describe future services are not evidence of deployed services, balances, performance, AI capabilities, or on-chain activity.

## Implemented source

- `src/` contains a Fastify server for local page/assets, readiness, configurable OIDC sessions, workspace scoped mission reads/writes and event creation.
- `services/organism.js` provides a provider-agnostic OpenAI-compatible generation gateway behind workspace role checks. It delegates inference and is not a ZLang runtime; see [Organism](ORGANISM.md).
- `service-worker.js` caches the static shell, refuses cross-origin browser requests and excludes API/auth responses from cache. This is an offline web shell, not a network mesh; see [eNET](ENET.md).
- `database/migrations/` and `database/schema.sql` describe an initial PostgreSQL model. The migration has not been run in this workspace and has not been verified against PostgreSQL here.
- `api/openapi.yaml` is a draft API contract. Contract conformance has not been exercised.
- `config/chain.config.js` hard disables chain integration. No wallet connector, RPC client, contract, signer, token operation, payment, or value transfer is implemented.
- `config/app.example.json` keeps payment, AI, CRM, automation and DSN flags disabled. Mission Control refers only to the API draft, not a deployed product.

`package-lock.json` and `node_modules` are present in this checkout. API, unit and static tests pass with injected service doubles. Dependency reproducibility, migration execution, real OIDC/provider calls, and LAN deployment have not been verified.

## Module boundaries

1. `src/config.js`: environment parsing and fail-closed production requirements.
2. `src/app.js`: HTTP routes and authentication/session integration; split further into plugins, routes and repositories before material growth.
3. `src/authorization.js`: role permissions and mission state transitions.
4. `database/migrations/`: versioned persistence changes, applied only through an explicit operator command.
5. `services/`: optional integrations. They remain disabled and must expose their configuration state rather than pretend work succeeded.
6. Static pages and PWA shell: public presentation assets only. The service worker must never cache authenticated/API responses or request external origins.

## Security boundaries

- Workspace membership must be checked for every workspace resource. SQL values are parameterized; integration tests are still required to verify tenant isolation.
- OIDC is fail-closed in production configuration, but the complete login/database path has not been tested with a provider or PostgreSQL.
- No key custody or secret collection is in scope. Never request or store seed phrases or private keys.
- All chain, payment, staking, lending, swap, bridge, mint, burn, and transfer functions remain off.

## Next stages

1. **Private LAN verification:** install the shell in a browser, confirm offline cache behavior and verify all requests remain on approved internal origins.
2. **Backend verification:** test migrations and OIDC against disposable local services, then verify workspace isolation.
3. **Organism integration:** configure a LAN-local model endpoint; native ZLang inference remains a separate research and implementation track.
4. **eNET/ZComm:** build node discovery and communications only from reviewed source contracts, with no public relay or internet dependency.
5. **Separate chain evaluation:** follow `WEB3_EVALUATION_PLAN.md`. No chain or value transfer is enabled here.

Each stage requires its own review. Passing local static tests is not production readiness.
