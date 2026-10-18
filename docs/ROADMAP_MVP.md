# Roadmap: verifiable ZDOS web platform

The goal is a modular web platform in the ZDOS ecosystem. “Operating system,” “DeFi protocol,” “production,” and similar labels are not applied to this repository unless implementation and independent evidence support them.

## Stage 0 — Make current state truthful

- Replace mock balances, fake uptime, simulated mining, false login and success messages with explicit disabled/unconfigured states.
- Remove collection of payment card details and calls to unimplemented endpoints.
- Document module boundaries, known limits, test status and an isolated Web3 evaluation plan.
- Add dependency-free static checks.

## Stage 1 — Verify the backend draft

- Restore npm registry access through normal environment operations; install dependencies with lifecycle scripts disabled and generate a lockfile.
- Validate migration syntax and run only against disposable local PostgreSQL.
- Test OIDC callback, session expiry/revocation, role checks, cross-workspace isolation, validation and SQL failure handling.
- Align OpenAPI and UI with implemented endpoints. Add membership management and auditable operator workflow only after design review.

## Stage 2 — Modular product foundation

- Split HTTP routes, identity/session, authorization, repositories and configuration into independently testable modules.
- Add CI with no secrets, migration checks, dependency review, static analysis and documented local fixtures.
- Mark every integration state as disabled, unconfigured, unavailable or verified from actual runtime evidence.

## Stage 3 — Separate Web3 evaluation

Follow `docs/WEB3_EVALUATION_PLAN.md`. Begin only with an isolated loopback local EVM, disposable in-memory test key, zero value, explicit allowlists and independent test review. Choosing a public network, RPC provider, wallet connection, signing or any value transfer requires a separate written plan and approval.

## Out of scope until separately approved

Mainnet, payments, custody, staking, lending, swaps, bridges, minting, burning, transfers, production contracts, autonomous agents and claims of measured uptime or performance.
