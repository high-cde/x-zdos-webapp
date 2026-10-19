# Repository overview: ZDOS web platform

## Verified repository contents

This workspace is a Fastify-served web shell with a service-worker offline cache and a Node.js API. It is not an OS, kernel, blockchain, or production financial protocol.

| Area | Present | Not established |
|---|---|---|
| Website | Fastify serves local HTML/assets; PWA shell caches public pages and blocks cross-origin browser requests | LAN deployment, offline browser verification, live product state |
| API | Fastify readiness, OIDC login and opt-in verified-email signup, workspace mission/event routes, admin-only operations and audited membership role updates, and configurable Organism gateway | Database migration, real OIDC/provider integrations, production readiness |
| Persistence | Initial PostgreSQL schema and migration source | A migrated or reachable database |
| AI | Authenticated Organism gateway for configured OpenAI-compatible providers; browser Wallet contains a local SHA-256 proof-of-work benchmark | Native ZLang inference, bundled model, provider reachability until a live request, agent execution, or DSN mining/rewards |
| Web3 | Disabled chain adapter flag and a separately documented evaluation plan | Chain, wallet, RPC, contracts, signing, balances or transactions |
| Financial actions | No supported implementation; UI controls disabled | Payment, custody, staking, lending, swap, bridge, mint, burn or transfer |

`package-lock.json` and `node_modules` are present in this checkout. `npm test`, `bash tests/smoke.sh`, JavaScript syntax checks, and `git diff --check` pass. Database migrations, real OIDC/provider integrations, PWA behavior in a browser, and LAN deployment remain unverified.

## Implementation approach

Keep presentation, API routes, authorization, persistence and optional adapters as separate modules. Feature availability should come from explicit configuration or runtime checks. An unconfigured integration must render “non configurato” and must not return fabricated success, balances, performance, uptime, AI output or chain state.

## Operational boundaries

Never read or commit environment secrets. No deployment, production database, provider, wallet, chain, funds, seed phrases or private keys are part of the current development stage. The `80.24` network and ZComm service are not configured or implemented by this checkout.

See [architecture](ARCHITECTURE.md), [roadmap](ROADMAP_MVP.md), and [Web3 evaluation plan](WEB3_EVALUATION_PLAN.md).
See [ZDOS Organism](ORGANISM.md) for provider setup and the native ZLang implementation gap.
See [eNET](ENET.md) for offline behavior and private-network setup boundaries.
