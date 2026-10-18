# Repository overview: ZDOS web platform

## Verified repository contents

This workspace is a static website plus a small Node.js API draft. It is not an OS, kernel, blockchain, or production financial protocol.

| Area | Present | Not established |
|---|---|---|
| Website | Standalone HTML/CSS/JS pages and local canvas animations | Backend-connected product state |
| API | Fastify route source for readiness, OIDC session and workspace mission/event operations | Dependencies installed, route execution, database migration, OIDC integration, production readiness |
| Persistence | Initial PostgreSQL schema and migration source | A migrated or reachable database |
| AI | UI labels and static illustrative templates | Model, inference, agent execution or measured result |
| Web3 | Disabled chain adapter flag and a separately documented evaluation plan | Chain, wallet, RPC, contracts, signing, balances or transactions |
| Financial actions | No supported implementation; UI controls disabled | Payment, custody, staking, lending, swap, bridge, mint, burn or transfer |

Registry DNS resolution failed on the last install attempt. `node_modules` and a generated lockfile are absent. Native Node tests can run; application tests importing Fastify remain blocked by absent dependencies. Do not describe blocked checks as passes.

## Implementation approach

Keep presentation, API routes, authorization, persistence and optional adapters as separate modules. Feature availability should come from explicit configuration or runtime checks. An unconfigured integration must render “non configurato” and must not return fabricated success, balances, performance, uptime, AI output or chain state.

## Operational boundaries

Only local offline work is in scope until separately authorized. Never read or commit environment secrets. No deployment, production database, external provider, wallet, chain, funds, seed phrases or private keys are part of the current development stage.

See [architecture](ARCHITECTURE.md), [roadmap](ROADMAP_MVP.md), and [Web3 evaluation plan](WEB3_EVALUATION_PLAN.md).
