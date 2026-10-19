# ZDOS Organism generative gateway

## Two distinct components

The upstream [ZDOS repository](https://github.com/high-cde/ZDOS) describes `zdos-organismd` as a bounded resident runtime: it runs a ZLang tick, compiles to bytecode, records state/events, and uses a `default-deny` guard. Its documented scope excludes arbitrary shell, network, node changes, deletion, and credential access. This resident process is not an LLM and does not generate natural-language responses.

This x-zdos web repository contains a separate generative gateway. Keep that boundary explicit: the gateway delegates text inference to an operator-configured provider, while the ZDOS resident runtime remains a constrained local execution service. The browser must not launch the resident process or grant it capabilities.

## Generative gateway available in this repository

The API can call a configured OpenAI-compatible `chat/completions` endpoint. The provider supplies the model weights and performs inference; this gateway authenticates the caller, checks workspace membership and role, limits prompts to 6,000 characters, caps output at 1,200 tokens, applies a 60-second timeout, and reports the provider model and usage when returned. Provider keys stay in server environment variables. Prompts and responses are not persisted by this route.

Set these server variables to activate generation:

```sh
ORGANISM_API_BASE_URL=https://your-provider.example/v1
ORGANISM_MODEL=the-model-id-from-your-provider
ORGANISM_API_KEY=server-side-secret
```

`ORGANISM_API_KEY` can be empty for a trusted local endpoint that does not require authentication. In development only, HTTP is accepted for loopback addresses. Production requires HTTPS. The configured endpoint is an operator-controlled outbound destination; do not let untrusted users configure it.

The endpoint must accept `POST {base URL}/chat/completions` with OpenAI-compatible chat fields and return `choices[0].message.content`. The API route is `POST /api/v1/workspaces/{workspaceId}/organism/generate`; roles `member`, `manager`, and `admin` can generate. `GET /api/v1/organism/status` reports server configuration, not provider health. A successful generation is the first live provider check.

## Native ZLang engine is not present

This gateway is implemented in Node.js and delegates inference to the configured provider. This checkout does not include the upstream `zdos-organism` or ZLang source trees, nor a text model, tokenizer, tensor kernels, or inference benchmarks. It therefore does not claim native ZLang inference or parity with another model. Keep generated ZLang syntax labeled as unverified until a real compiler and reference tests are available.

To integrate the resident service, add an authenticated read-only observer for its status/events and verify event signatures; do not invoke its daemon from a browser route. To build a native generative engine, bring the actual ZLang/Organism repositories into the workspace and establish whether either contains a tokenizer, text model, and tensor inference path. Then define language/compiler versions, model format and license, supported hardware, deterministic test vectors, and reproducible benchmarks. Implement and test a narrow inference slice (tokenization, one forward pass, sampling, stop conditions) before comparing quality, speed, memory, and correctness against existing runtimes. Do not use the gateway's provider response as evidence for native execution.

## Operational limits

This stage has no provider credentials or database configured in the local environment, so the provider was tested through a mocked adapter only. Production needs provider-side budget/rate limits, data-retention review, monitoring that excludes prompt content and secrets, and load tests before broad access. The gateway currently has no distributed quota or streaming response support.
