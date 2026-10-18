# Separate Web3 evaluation plan — not implementation approval

This document defines a gated evaluation only. Nothing in it enables a wallet, RPC connection, chain interaction, signing, or transfer. No mainnet or production protocol is proposed.

## Candidate test environment

- **Network:** an ephemeral local EVM development chain (Anvil) created and destroyed for each test run. It has no external connectivity and no real-value assets. This is a candidate harness, not a selected production chain.
- **Wallet:** no wallet connection in the first evaluation step. Contract tests use a disposable local test signer created by the test harness; keys exist only in process memory and must never be printed, persisted, or reused. Browser wallet connection is a later, separately reviewed read-only step.
- **RPC:** loopback-only endpoint bound to `127.0.0.1` by the local test harness. No hosted RPC provider, credentials, browser RPC endpoint, or production endpoint is configured.
- **Permissions:** first pass is read-only contract metadata and local test calls. Any later write requires an explicit allowlist of chain ID, contract address, method, caller role, calldata bounds and value limit. The default value limit is zero; no arbitrary contract calls.

## Threats to address

Wrong-chain or wrong-contract interaction; malicious or upgraded contracts; compromised RPC responses; replay and signature phishing; unsafe transaction simulation; secret leakage through logs/builds; browser-origin attacks; excessive permissions; compromised dependencies; and UI spoofing of balances, confirmations or receipts.

## Required tests before any testnet proposal

1. Unit tests for chain ID/address allowlisting, ABI encoding, decimal handling, state transitions and rejection paths.
2. Local-chain integration tests with fresh state and disposable keys; assert no request leaves loopback and no value-bearing transaction is possible.
3. Negative tests for wrong chain, wrong contract, malformed ABI, RPC failure, replay, stale nonce, unsupported method, non-zero value and untrusted origin.
4. Verify UI never presents a submitted action as confirmed before receipt verification and never invents balances or transaction hashes.
5. Reproducible dependency lock, static analysis, coverage of authorization and failure paths, and independent review of the harness.

## Review and audit gates

Before selecting a public testnet or RPC vendor, perform a separate design review of data collected, endpoints, rate limits, terms, chain ID and provider trust. Before any mainnet consideration, require a threat model, contract source verification, independent smart-contract audit, dependency and build provenance review, authorization review, incident/recovery plan, explicit operational owner, and new written approval. This repository currently has no contract code or audit evidence.

## Current state

No chain, wallet, RPC or testnet is configured. Mainnet, custody, payments, staking, lending, swaps, bridges, mint, burn and all value transfers remain disabled. Do not infer that this plan authorizes implementation or connection.
