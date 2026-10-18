# Roadmap

1. Make static pages truthful and add dependency-free regression checks.
2. Resolve npm access normally, generate a reviewed lockfile, then verify the API against disposable local PostgreSQL and test OIDC configuration.
3. Split route, persistence and integration modules; improve workspace administration and test coverage.
4. Evaluate Web3 separately in an isolated local test chain only after a dedicated threat model, permissions review and explicit approval.

Mainnet, funds, payments, custody, staking, lending, swaps, bridges, mint and burn remain disabled and outside the current scope. See `docs/ROADMAP_MVP.md` and `docs/WEB3_EVALUATION_PLAN.md`.
