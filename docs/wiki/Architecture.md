# Repository architecture

This repository is a web application workspace made from static pages and an unverified Node.js API draft. It is not an operating system or a production DeFi protocol.

The backend source separates basic configuration and readiness, HTTP routes, role policy, PostgreSQL schema/migrations, and optional adapters. The current `src/app.js` remains a draft monolith; modular route and repository extraction belongs to a later verified stage.

The chain adapter is hard-disabled and there is no chain, wallet, RPC or contract implementation. All value operations remain out of scope. Static pages must state when features are only illustrative, unconfigured or disabled.

See the repository [architecture](../ARCHITECTURE.md), [roadmap](../ROADMAP_MVP.md) and [Web3 evaluation plan](../WEB3_EVALUATION_PLAN.md).
