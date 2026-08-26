# Fielora V0.1 Web Intelligence — First Slice Change Impact

**Status:** IMPLEMENTATION AUTHORIZED / SLICE-BOUNDED
**Impact:** HIGH
**Scope:** `web.search` + `web.fetch` only

## User flow and desktop verification

The Primary Agent may select `web.search`, inspect bounded public search
results, then independently select `web.fetch` for one public page. Both calls
remain ordinary Tools governed by the existing Harness policy, approval,
execution, durable ToolCall receipt, and verification boundaries. There is no
new Agent, Runtime, UI, Browser session, cache, schema, or migration.

The first Slice is verified with deterministic injected backends through the
real ToolProvider/catalog/PolicyEngine/RoutedToolExecutor path. Live public
requests and desktop UI validation are deliberately excluded unless separately
authorized.

## Architecture delta

- Extend `ProviderToolDefinition` with the existing `AgentToolEffect`; catalog
  admission remains Fielora-authored and uses that effect instead of assigning
  every provider Tool `OBSERVE`.
- Add one Tools-side `WebToolProvider` contributing stable `web.search` and
  `web.fetch` definitions, both with `NETWORK` effect.
- Add a provider-neutral `SearchBackend` seam and a Brave Search API adapter.
  Brave DTOs stay behind the seam.
- Add a stateless public HTTP fetcher with DNS/IP admission, address pinning,
  per-redirect revalidation, fixed GET, no cookies, no implicit proxy, bounded
  streaming, and HTML/plain-text extraction.
- Add a bounded Fielora-owned provider failure-kind taxonomy so credential,
  timeout, DNS, TLS, rate-limit, HTTP, malformed, oversized, destination,
  redirect, and MIME failures retain stable error codes while still ending in
  the existing FAILED ToolCall state. CANCELLED and UNKNOWN remain unchanged.
- Reuse the existing provider receipt payload and Core-authored
  `execution_source`. Web success is execution evidence, not Verification PASS
  or AgentRun completion authority.

## Security decisions

- Only HTTP/HTTPS and ports 80/443; userinfo and non-public destinations are
  rejected. Every connection uses the exact resolved addresses that passed the
  public-IP gate. Redirects are manual and capped at five.
- No automatic decompression is enabled. Requests advertise `identity`, and a
  non-identity `Content-Encoding` is rejected before body ingestion. The
  streaming body bound is 2 MiB.
- Extracted text is bounded below the existing 64 KiB provider-observation
  contract. HTML is parsed with `scraper`/`html5ever`; script, style, navigation,
  hidden, and other non-content subtrees are excluded.
- Search snippets and fetched text are explicitly wrapped and labelled
  `UNTRUSTED_WEB_CONTENT`; they cannot grant policy, permission, Skill, Tool, or
  Verification authority.
- The existing generic CredentialStore mechanics do not yet provide a
  product-level non-model credential identity/configuration flow. This Slice
  therefore accepts only explicitly injected `SecretBytes` for the Brave
  adapter. It adds no credential UI, schema, migration, environment lookup, or
  automatic activation.

## Dependency impact

- Reuse exact `reqwest = 0.13.4` with existing `rustls`, `json`, and `stream`
  features; automatic compression and cookies remain disabled.
- Add exact `scraper = 0.27.0`, `default-features = false`, ISC license. The
  crate declares no `rust-version`; edition 2024 implies Rust 1.85 or newer.
  Its parser dependencies are `html5ever`, `selectors`, `cssparser`,
  `ego-tree`, `tendril`, and `precomputed-hash`.
- Because production Core linkage changes, the targeted gate includes a Core
  release build plus dependency-tree and advisory review.

Final dependency facts:

```text
HTTP client          reqwest 0.13.4 (existing exact pin)
TLS backend          rustls (existing feature)
HTTP features        rustls, json, stream; default features disabled
proxy                ClientBuilder::no_proxy
redirect             manual; reqwest Policy::none
compression          no decoder feature; Accept-Encoding identity; reject otherwise
HTML parser          scraper 0.27.0 (new exact pin)
parser features      none; default features disabled
parser license       ISC
parser MSRV          not declared; edition 2024 implies Rust >= 1.85
repository rustc     1.97.1
parser subtree       cssparser, ego-tree, html5ever, selectors, tendril,
                     precomputed-hash and their locked support packages
RustSec advisory DB  a7bfe16948bf6f3ee25bdee4822209f87da21b80
advisory result      no affecting advisory for the locked subtree;
                     lock_api RUSTSEC-2020-0070 is patched since 0.4.2,
                     locked version is 0.4.14
```

## Rollback and deferred work

The delta is additive and can be rolled back by removing the provider module,
the provider-effect field, and the parser dependency. Product credential
activation, live validation, UI, Browser fallback, query rewriting, cache,
crawling, download/file intelligence, and additional search backends remain
explicitly deferred.

## Targeted validation result

```text
Web Tool tests                 15/15 PASS
fielora-agent                  45/45 PASS (includes Skill regression)
fielora-model                  17/17 PASS
fielora-platform                2/2 PASS
fielora-core                   23/23 PASS
real stdio MCP regression      12/12 PASS
targeted Clippy -D warnings    PASS
cargo fmt --check              PASS
Core release build             PASS
pnpm contracts:check           PASS
pnpm verify:dev:docs           PASS
git diff --check               PASS
live Brave requests            0
live public fetch requests     0
```

Desktop E2E, packaged/portable smoke, and full premerge were not run because
this Slice changes no Desktop UI, Browser host, or packaging behavior.
