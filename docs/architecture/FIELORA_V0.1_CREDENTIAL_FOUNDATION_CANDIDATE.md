# Fielora V0.1 Credential Foundation Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `GENERIC STATIC_SECRET + BRAVE FIRST CONSUMER: IMPLEMENTED / VALIDATED`

**Baseline:** `cb30e080e3305efaa2c68ce0952c66d381405038`

**Track:** subordinate to `RAPID_DESKTOP_EXECUTION_V0.1.md` and the
canonical `Model + Harness + Tools` Agent architecture

**Document Change Impact:** `LOW / FACTUAL CANDIDATE UPDATE`

**Candidate Runtime Change Impact:** `HIGH / SECURITY-SENSITIVE`

This Candidate audits the credential behavior present in Fielora and records
the implemented, authorized first Slice for a generic static credential binding
with Brave Search as its first consumer. It does not authorize any subsequent
Slice, amend a Frozen/Baseline document, define a new Agent runtime, or freeze
an MCP configuration schema.

## CURRENT_CREDENTIAL_REALITY

### Existing end-to-end paths

The repository currently has two bounded credential paths:

1. Model Provider credentials have a complete Windows product path:
   trusted Renderer write-only input -> FIPC -> Core -> Windows Credential
   Manager -> model adapter request header. Non-secret Provider metadata and a
   model-specific `credential_ref` are durable in SQLite.
2. Brave Search declares an exact static credential requirement. The Harness
   resolves a Fielora-owned route/consumer/slot binding after Policy/Approval
   and supplies one `SecretBytes` value to the selected adapter for that
   execution only. The backend retains no credential. There is deliberately no
   product UI, automatic binding, or durable generic credential registry.

MCP intentionally rejects credential/env configuration. A generic non-model
credential identity, typed Platform store facade, in-memory composition-time
binding, and execution-time resolver now exist. Generic metadata storage,
human ingress/UI, and product-managed bindings remain absent.

### Reality audit

`EXISTS` means the stated behavior exists for its current bounded owner; it
does not imply a generic Integration Credential contract.

| Item | Status | Current module/file | Existing semantic owner | Gap |
|---|---|---|---|---|
| SecretBytes memory wrapper | `EXISTS` | `crates/fielora-platform/src/lib.rs` | Platform security primitive | Bounded byte wrapper exists, but zeroization is a best-effort `fill(0)` rather than a hardened zeroize primitive. |
| secure persistent store | `EXISTS` | `CredentialStore`, `WindowsCredentialStore` in `crates/fielora-platform/src/lib.rs` | Platform | Production backend exists only on Windows; no generic Integration Credential metadata exists. |
| Windows Credential Manager integration | `EXISTS` | `crates/fielora-platform/src/lib.rs` | Platform | Uses Generic Credentials and the current Windows user profile. macOS/Linux adapters are not implemented. |
| model credential identity | `EXISTS` | `ProviderConfigRecord.credential_ref` in `crates/fielora-storage/src/lib.rs` | Model Provider configuration | Target is deliberately model-specific: `Fielora/provider/<provider UUID>`. It should remain intact. |
| non-model credential identity | `EXISTS` | `CredentialRef` in `crates/fielora-platform/src/lib.rs` | Platform | Opaque `cred_<UUIDv7>` identity and isolated target derivation exist. No trusted human management surface or durable metadata registry exists. |
| credential create | `PARTIAL` | `CredentialStore::put_static`; existing model `command.provider.store_credential` | Platform; model Provider settings | Typed internal static-secret write exists, but no generic human/FIPC ingress exists. |
| credential read | `PARTIAL` | `CredentialStore::resolve_static`; Harness `StaticCredentialMediator`; model run preparation | Platform; selected execution path | Generic read is restricted to exact Harness mediation and is not exposed to Model/Skill/Provider. No human readback exists by design. |
| credential update | `PARTIAL` | `CredentialStore::put_static`; `CredWriteW` replacement | Platform | Same-ref replacement is observed by the next execution. No product rotation workflow or durable metadata exists. |
| credential delete | `PARTIAL` | `CredentialStore::delete_static`; existing model Provider commands | Platform; model Provider settings | Generic typed delete exists and the next bound execution fails closed. No generic human delete surface exists. |
| existence/query without secret read | `PARTIAL` | default `CredentialStore::exists`; Provider list/get reconciliation | Platform + Model Provider projection | Public view returns only `credential_present`, but default `exists` internally performs `read` and copies the secret. No metadata-only native existence probe. |
| Tool Provider credential binding | `EXISTS` | `StaticCredentialRequirement`, `StaticCredentialBinding`, `RoutedToolExecutor` in `crates/fielora-agent/src/lib.rs` | Harness Execution + Tools routing | Exact route/provider/slot binding exists at composition time. Durable product binding management is absent. |
| execution-time secret injection | `PARTIAL` | `StaticCredentialMediator`; `ToolProvider::execute_with_static_credential`; Brave adapter in `web.rs` | Harness Execution + selected adapter | Generic per-execution injection exists and Brave consumes it. Model preparation remains its separate existing run-scoped path; other consumers are not implemented. |
| MCP env injection | `ABSENT` | `mcp_connections.rs`, MCP session/`ManagedChild` | MCP Tool provider + Platform process primitive | Config rejects credential/env fields and MCP starts with an empty explicit environment. |
| HTTP Authorization/header injection | `EXISTS` | model HTTP clients; `BraveSearchBackend` in `web.rs` | Selected HTTP adapter | Adapter-local injection exists; Brave receives a sensitive header value only for the current execution. |
| credential scope | `PARTIAL` | model Provider ownership; exact static route/consumer/slot binding | Model configuration + Harness composition | Exact Brave scope exists. Project/grant hierarchies and human-managed scope are intentionally absent. |
| credential/provider binding | `PARTIAL` | `provider_configs.credential_ref`; `StaticCredentialBinding` | Model configuration + Harness composition | Exact model and static Tool-provider bindings exist. Static bindings are not durable or product-configurable. |
| credential redaction | `PARTIAL` | `SecretBytes`; command-output heuristics; provider error mapping | Platform + individual adapters | Structural exclusion is strong on current paths, but there is no universal secret-aware receipt/event/log guard. |
| Debug redaction | `PARTIAL` | custom `Debug for SecretBytes`; `StoreCredentialRequest` derives `Debug` | Platform and contracts | `SecretBytes` prints `[REDACTED]`; the transient secret-bearing DTO is an ordinary debuggable `String` DTO and must not be generalized. |
| event redaction | `PARTIAL` | Agent event construction in `crates/fielora-core/src/agent_runtime.rs` | Harness | Existing managed credential bytes are not placed in events. There is no generic last-line event scrubber for a faulty future Provider. |
| receipt redaction | `PARTIAL` | Tool executor and `agent_tool_calls.receipt_json` | Harness Execution + Storage | Existing Web tests prove no Brave secret in receipts, but arbitrary Provider receipts are persisted as supplied after bounds checking, not secret-redacted generically. |
| log redaction | `PARTIAL` | Core tracing; Desktop `supervisor.ts`; model/Web/MCP adapters | Each logging owner | Current credential flows avoid headers/payload logging and map bounded errors. No unified log redactor can guarantee safety for a faulty Provider or third-party stderr. |
| FIPC secret transport | `PARTIAL` | `StoreCredentialRequest`, `main.ts`, `fipc.ts`, `preload.ts` | Trusted Desktop ingress + Core command | Write-only model path exists and is not logged, but the secret crosses Electron IPC and newline JSON as ordinary transient strings/buffers that cannot be zeroized reliably. |
| Renderer secret visibility | `PARTIAL` | `Phase04Layer.tsx` | Trusted Settings UI | Existing stored secret is never returned. Newly typed bytes are necessarily visible to the trusted page/DevTools and briefly to DOM/JS; the field avoids React state and is cleared after submit. |
| Agent/model secret visibility | `EXISTS` | Context/model request construction | Harness + Model adapter | Managed secret bytes are excluded from prompts and Model-facing Tools. General content DLP for secrets independently present in arbitrary user text/files remains heuristic. |
| Skill secret visibility | `EXISTS` | Skill admission and ContextCompiler/tool boundaries | Harness Context | Skills receive no CredentialStore API or environment. Untrusted instructions can request a key but cannot obtain a managed secret; general user-file DLP remains partial. |
| subagent secret inheritance | `EXISTS` | `run_readonly_subagent`, child run preparation and boundary tests | Harness Orchestration | Read-only children inherit no static Tool binding, secret bytes, or environment and cannot resolve the parent static credential. Future authenticated child Tool admission remains separate scope. |
| credential revocation | `PARTIAL` | Provider delete/remove; `CredentialStore::delete_static` | Human model configuration + Platform | The next Brave execution fails `CREDENTIAL_MISSING`; in-flight HTTP requests and current model runs cannot be recalled. |
| credential rotation | `PARTIAL` | `CredentialStore::put_static` replacement | Platform | The next Brave execution resolves replacement bytes with no provider cache. Product rotation workflow remains absent. |
| OAuth | `ABSENT` | No implementation | Future Platform/Provider-specific auth | Authorization-code, refresh-token, browser callback, expiry, and consent lifecycle are out of scope. |
| service account | `ABSENT` | No implementation | Future provider-specific auth | Structured key documents and impersonation/delegation semantics are out of scope. |
| remote MCP auth | `ABSENT` | MCP config currently Local STDIO only | Future MCP adapter | No remote transport, headers, OAuth, or credential binding. |

### Current Windows store facts

- `CredentialStore` accepts an opaque target string and `SecretBytes`; it
  exposes `store`, `read`, `delete`, and a default `exists`.
- `WindowsCredentialStore` uses `CRED_TYPE_GENERIC`, target names supplied by
  the caller, username `Fielora`, and `CRED_PERSIST_LOCAL_MACHINE` under the
  current Windows user profile.
- The current maximum credential blob is 2,048 bytes. Empty and oversized
  values fail closed.
- `CredWriteW` replaces the same target. No version history is kept.
- Delete treats an absent target as success. Read maps absence separately from
  invalid size and Platform failures.
- Native read buffers are released with `CredFree`; the copied Rust buffer is
  wrapped in `SecretBytes`.
- Enumeration is not exposed. Target syntax/collision is currently a caller
  responsibility.
- SQLite stores a model-specific reference and `credential_present`, never the
  secret. Portable profile movement does not move Windows Credential Manager
  blobs.

No stop-condition evidence was found that the current store writes credential
bytes to Fielora SQLite/project files, that existing stored secrets can be read
back by the Renderer, or that current model/Web requests persist authorization
headers in a receipt.

## ARCHITECTURE_BOUNDARY

Credential Foundation remains inside the existing architecture:

```text
Model + Harness + Tools
          |
          +-- Harness.Governance / Execution
          |     owns binding admission and exact-use mediation
          |
          +-- Tools
          |     owns Provider/backend adapters
          |
Platform
  +-- SecretBytes
  +-- CredentialStore
  +-- WindowsCredentialStore
```

There is no Credential Agent, Credential Runtime, Secret Agent, Credential
Permission Engine, second Tool executor, or second receipt/verification path.

Semantic ownership is split narrowly:

- Platform owns secret storage and memory wrapper primitives.
- Human-owned configuration owns non-secret credential metadata and binding.
- Harness Governance/Execution admits the concrete Tool and mediates use of
  the already-bound secret.
- The selected Fielora-owned Provider adapter performs the protocol-specific
  injection.
- The existing PolicyEngine, Approval, ToolCall ledger, receipt, and
  Verification boundaries remain authoritative.

Credential lifetime is independent of an AgentRun. Credential *use* is never
independent of the existing Harness execution path.

## SECRET_AUTHORITY

### Hard invariant

Real secret bytes MUST NEVER enter:

- Model context, system prompts, user-visible Tool schemas, or Tool
  descriptions;
- Skill body/metadata/context or subagent context;
- Model-proposed Tool arguments or durable `arguments_json`;
- Agent events, Tool receipts, Verification receipts, normal logs,
  diagnostics, or error text;
- Context Snapshots, Project files, `mcp.json`, Artifacts, or Fielora SQLite;
- provider discovery metadata or third-party-selected credential references.

No receipt may contain the secret value, a secret hash, a prefix, or last four
bytes. `SHA-256(secret)` is explicitly forbidden as provenance.

The only permitted byte path is:

```text
CredentialStore
  -> SecretBytes
  -> exact admitted binding prepared by Harness execution
  -> selected Fielora-owned Provider execution adapter
  -> protocol header / bounded library parameter
  -> drop as soon as the execution no longer needs it
```

Provider backends MUST NOT receive `CredentialStore` or
`get(any_credential_ref)`. Third-party Tool metadata has no authority to name,
change, or enumerate a credential.

## CREDENTIAL_IDENTITY

The existing model reference remains semantically specific:

```text
Fielora/provider/<ProviderConfigId>
```

It was not renamed or forced into a generic registry. The implemented additive
identity uses two layers:

```text
credential_id  = opaque stable non-secret ID: cred_<UUIDv7>
credential_ref = non-serde typed wrapper around that complete ID
store target   = Fielora/credential/<credential-ref>, derived by Platform code
```

Comparison:

| Identity | Advantages | Risks | First Slice decision |
|---|---|---|---|
| Human-readable semantic key, e.g. `github.personal.default` | Easy manual config and diagnostics; portable-looking. | Rename/collision behavior; leaks service relation; encourages hand-authored global namespace and credential selection by strings. | Do not use as the primary identity. A human label may be separate non-secret metadata later. |
| Opaque stable ID | Stable across rename; provider-neutral; collision-resistant; appropriate for an exact binding. | Poor for hand-authored config; requires a trusted management/read model eventually. | **Implemented.** |

The Candidate does not define a Marketplace-global namespace. A
`credential_ref` is non-secret and may eventually appear in trusted Provider
configuration, a trusted UI read model, and an admitted binding. It must not be
placed in a Model-facing Tool schema or proposed arguments because that would
let the Model influence credential selection.

Only `STATIC_SECRET` is implemented in this Slice: API keys, personal
tokens, and opaque password/token bytes. OAuth, refresh tokens, service
accounts, certificates, SSH keys, cookies, and browser sessions remain separate
future Change Impacts.

## BINDING_MODEL

Binding is Fielora-owned composition, not Provider self-description:

```text
StaticCredentialBinding
  tool_provider_id = fielora.web
  requirement.consumer_id = brave.search.v1
  requirement.slot = subscription_token
  credential_ref = cred_<UUIDv7>
```

The binding grants one configured consumer slot access to one credential. It
does not grant permission to execute the Tool.

Execution flow:

```text
Model proposes web.search(query, count)
  -> existing catalog resolution
  -> existing PolicyEngine / Approval
  -> existing ToolCall ledger (query/count only)
  -> Harness resolves the exact Fielora-owned binding
  -> CredentialStore reads exactly that ref
  -> selected Brave adapter receives SecretBytes
  -> x-subscription-token header is created and marked sensitive
  -> request completes/fails
  -> SecretBytes drops
  -> existing bounded receipt/observation/Verification boundary
```

The Provider cannot request another ID and the Model cannot supply the ID.
Unknown consumer, missing binding, mismatched slot, missing credential, or
deleted credential fails closed before the external request.

Preferred adapter API is an exact pre-resolved `SecretBytes` value for one
execution. A resolver permanently restricted to one binding is acceptable only
if the execution API makes it impossible to name another ref. A generic store
handle in Provider code is rejected.

First Slice durable metadata was not required. Explicit composition and tests
prove the contract without a database migration. Product-managed labels,
timestamps, lists, and durable generic bindings require a separate storage/UI
decision.

## STORE_DECISION

`WindowsCredentialStore` is used for the Windows-first `STATIC_SECRET` Slice.
It provides bounded Generic Credential persistence, replacement, delete,
stable error categories, and a non-serializable `SecretBytes` result.

Implemented typed facade over the existing `CredentialStore`:

```text
put_static(credential_ref, SecretBytes)
resolve_static(credential_ref) -> SecretBytes
static_exists(credential_ref) -> bool
delete_static(credential_ref)
```

This is a thin typed facade over the current `CredentialStore`; the backend and
existing model target behavior were not refactored. Only the Harness mediator
calls `resolve_static`, and the resolved bytes do not escape the selected
execution. A future metadata-only `exists` optimization remains desirable but
was not a First Slice prerequisite.

No database migration is required for the recommended proof Slice. If generic
credential labels, timestamps, durable binding management, Project scope, or
portable binding import become product requirements, that is
`STORAGE_CHANGE_REQUIRED / HIGH` and needs a separate Change Impact.

Cross-platform status is honest: Windows production implementation exists;
macOS Keychain and Linux Secret Service are `NOT_IMPLEMENTED`. The generic
contract must permit future Platform adapters without pretending they exist.

## MEMORY_LIFECYCLE

Current `SecretBytes` facts:

- no `Clone`, `Display`, `Serialize`, `Deserialize`, or `Deref` implementation;
- custom `Debug` emits only `SecretBytes([REDACTED])`;
- access requires explicit `expose()`;
- `Drop` fills the owned vector with zero bytes;
- conversion to HTTP header/model client necessarily creates additional
  library/string buffers whose clearing is not guaranteed.

Implemented default for the Brave path:

```text
NO LONG-LIVED SECRET CACHE
resolve -> inject -> execute -> drop
```

Do not retain a secret in a `ToolProvider` struct or across multiple Tool
executions. Concurrent calls independently resolve bounded `SecretBytes`; the
existing Tool execution concurrency remains the bound, and bytes must not be
cloned into unbounded tasks.

Replacement of the same ref affects the next resolution. Delete causes the
next execution to return `CREDENTIAL_MISSING`. Rotation/revocation cannot pull
bytes out of an HTTP request already in flight; that bounded limitation is
accepted. No version history is proposed.

The current model `PreparedRun` still retains its Provider key for the AgentRun.
That existing model-specific lifetime is not generalized. The Brave backend is
now stateless with respect to credentials: each Tool execution resolves,
injects, uses, and drops its own `SecretBytes`. Refactoring model run
preparation remains separate scope.

A stronger non-optimizable zeroization primitive would improve defense in
depth, but adding a dependency or broad memory rewrite is not authorized by
this Candidate. Any future change must also account for unavoidable copies in
Electron IPC, serde JSON, HTTP header libraries, and OS APIs.

## MODEL_BOUNDARY

The Model may receive bounded non-secret availability facts such as:

```text
Brave Search authentication: configured
GitHub Tool authentication: configured
MCP credential support: unavailable
```

It never receives the secret, `credential_ref`, store target, Authorization
header, or a Model-facing credential management/read Tool. The Model selects a
capability (`web.search`), not a credential.

No `credential.read`, `credential.get_secret`, `secret.resolve`,
`credential.add`, `credential.update`, or `credential.delete` Tool may be added.
Credential administration is a future trusted human configuration action.

Current managed model keys follow this principle: context/request bodies omit
the key and the selected protocol adapter creates the authentication header.
Existing heuristic Context filters are not a universal DLP guarantee for
secrets that a user independently placed in arbitrary ordinary content; that
separate problem does not weaken the managed-credential invariant.

## SKILL_BOUNDARY

An external or Project Skill is untrusted instruction/context. It can declare
an advisory capability dependency such as `requires GitHub capability`, but it
cannot:

- access or enumerate the CredentialStore;
- select a `credential_ref`;
- receive inherited secret environment variables;
- grant Tool permission or network access;
- cause automatic Provider/MCP activation;
- print a managed key merely by instructing the Model to do so.

Credential resolution occurs only after normal Tool selection and Policy at
the selected Provider execution boundary. `Skill != Credential Authority`.

## SUBAGENT_BOUNDARY

Read-only subagents are separate child AgentRuns. They inherit no
parent secret bytes, process environment, or secret-bearing context. Their
model adapter independently resolves the configured model Provider key, and
the child never sees the bytes.

Implemented rule for static Tool credentials:

```text
Subagent inherits no credential bytes and no generic credential grant.
```

If a future child catalog includes an authenticated Tool, the child may use
only that admitted Tool through the same Policy/ToolProvider path. The exact
Provider binding is resolved by Harness execution and is not copied into child
context or Tool configuration visible to the Model. The present read-only
child catalog does not include run-scoped external MCP/Web Providers, and an
actual child AgentRun test proves it never reads or inherits the parent static
credential. A future authenticated child Tool grant remains a separate design.

## FIPC_BOUNDARY

The current model key UI demonstrates a write-only ingress:

```text
trusted password input (not React state)
  -> preload write command
  -> Main sender/origin validation
  -> validated bounded StoreCredentialRequest
  -> FIPC JSON to Core
  -> immediate SecretBytes conversion
  -> WindowsCredentialStore
```

Provider list/get returns only `credential_present`; no API returns stored
bytes. The input is cleared after success or failure. Main/FIPC logging records
method/run/timing facts rather than request payloads.

The boundary is nevertheless `PARTIAL`: the new secret temporarily exists in
the trusted Renderer DOM/JS, Electron structured clone, Main JS object, serde
JSON string/buffer, and Core request string. These ordinary strings cannot be
reliably zeroized, and `StoreCredentialRequest` currently derives `Debug`,
`Clone`, and serde traits. This DTO is acceptable only as bounded existing
ingress and must not become a generic secret transport without focused review.

Future human credential input must retain write-only semantics and must not
enter React state, local/session storage, ordinary telemetry, or Agent context.
No Credential UI or FIPC delta is part of the implemented First Slice.

## LOG_RECEIPT_BOUNDARY

Current structural protections:

- `SecretBytes` Debug is redacted and has no Display/serde path.
- Desktop FIPC metrics log method/timing, not payload.
- Core does not log credential request params.
- Model and Brave adapters do not log request headers/bodies and map 401/403 to
  bounded `CREDENTIAL_REJECTED` categories.
- MCP stderr content is drained without durable content; only a bounded byte
  count is retained.
- Web tests prove the injected Brave key is absent from observation/receipt.

Current gaps:

- Tool arguments and Provider receipts are durable JSON. Bounds checks are not
  secret-aware; a faulty future Provider could return a secret.
- Core stderr is surfaced by the Desktop supervisor, so Core must continue to
  avoid secret-bearing errors.
- command output redaction is keyword/prefix heuristic, not a general secret
  detector.
- third-party MCP stderr can deliberately print its environment.
- transient DTO `Debug` safety depends on callers never logging the value.

First Slice rules:

- credential ref/secret never appears in Tool arguments;
- adapter errors are stable categories only: `CREDENTIAL_MISSING`,
  `CREDENTIAL_REJECTED`, or an existing provider-neutral failure;
- request headers and request dumps are never attached to errors;
- receipts need no credential identity. If a fact is required later, only a
  coarse `authenticated: true` or non-secret binding kind may be considered;
- never persist secret value/hash/prefix/last4;
- existing `execution_source`, ToolCall, receipt, and Verification structures
  are reused unchanged.

A focused boundary test with a unique high-entropy sentinel now proves
structural exclusion and adapter-specific non-leakage. No large logging
framework was added.

## FIRST_CONSUMER_DECISION

| Option | Value | New security boundary | Decision |
|---|---|---|---|
| A. Local MCP environment injection | Directly unlocks many local MCP servers and follows the current connection UI. | Secret enters an arbitrary child process environment and can be copied to stderr or descendants. Process-tree trust and diagnostics require additional design. | Defer. |
| B. Brave Search API | Uses the existing provider-neutral Web Tool and Brave header adapter; can later unblock the bounded live gate. | One selected HTTPS adapter receives the bytes; no process environment, argv, or third-party stderr. | **Implemented first consumer.** |
| C. Generic HTTP Tool Provider | Broad reusable surface. | Premature arbitrary headers/endpoints/auth semantics and larger authority surface. | Reject for First Slice. |

`IMPLEMENTED_FIRST_CONSUMER: B. BRAVE SEARCH API`

This implementation proves a generic credential identity/binding/execution
boundary while adding the fewest new secret-bearing surfaces.

## BRAVE_PATH

Baseline path before this Slice:

```text
WebToolProvider::with_brave(SecretBytes)
  -> BraveSearchBackend retains SecretBytes
  -> x-subscription-token HeaderValue (sensitive)
  -> HTTPS request
```

Implemented First Slice path:

```text
explicit Fielora-owned binding for fielora.web + brave.search.v1 + subscription_token
  -> Harness admits web.search through existing Policy/Approval
  -> exact credential_ref resolution for brave.search.v1/subscription_token
  -> SecretBytes supplied for this execution only
  -> sensitive x-subscription-token header
  -> bounded request/result
  -> drop
  -> existing ToolCall receipt + Verification boundary
```

The public `web.search` Tool schema remains only query/count. The provider ID,
binding/ref, target name, and secret remain outside Model-visible arguments.
401/403 maps to `CREDENTIAL_REJECTED`; missing/deleted binding maps to
`CREDENTIAL_MISSING`. No provider response header/body dump is admitted into
the error.

The deterministic gate used a local fixture HTTP endpoint to prove that the
expected sentinel arrives only in the intended sensitive header and is absent
from the URL, Tool arguments, observation, receipt, Agent events, Verification
evidence, errors, files, SQLite, and child context/environment. Success,
missing, deleted, rotated, rejected, malformed, rate-limit, server-error,
timeout, DNS, and TLS paths were exercised deterministically.

A real Brave request is optional and separate. It requires a user-provided or
already-legally-configured key plus explicit authorization for one bounded
request. Without that, architecture may pass while
`WEB_SEARCH_LIVE_GATE: BLOCKED_NO_CREDENTIAL`. No key may be written to the
repository or report.

## MCP_FUTURE_PATH

MCP credential binding is a future Candidate, not a frozen schema. A possible
human-owned configuration shape is:

```json
{
  "mcpServers": {
    "github": {
      "command": "C:\\absolute\\server.exe",
      "args": [],
      "env": {
        "GITHUB_TOKEN": {
          "credential": "cred_<opaque-id>"
        }
      }
    }
  }
}
```

The JSON stores a non-secret reference, never the value. The binding must be
admitted as Fielora-owned connection configuration; MCP server metadata cannot
request arbitrary refs.

Future execution must preserve:

```text
ManagedChild env_clear
  + explicit admitted non-secret environment
  + exact credential-derived environment for this connection
  + no secret in argv
```

The no-secret-in-argv rule is hard because process command lines are broadly
observable and commonly logged.

An important limit cannot be promised away: once a credential is intentionally
given to an MCP process environment, that process can read, print, transmit,
or pass it to any descendant it launches. A Windows Job Object controls
lifetime, not confidentiality. Therefore the grant scope is the admitted MCP
process tree unless a stronger sandbox is separately designed. The requirement
that an arbitrary server must not propagate to descendants is not enforceable
by `env_clear` alone.

Raw stderr persistence must remain disabled for credential-aware MCP. Future
diagnostics should retain content-free byte counts or a separately designed
bounded ephemeral/redacted channel. This process-tree/stderr boundary is why
MCP is not the First Slice.

Remote MCP auth, HTTP headers, OAuth, transport security, and UI/installer are
all out of scope.

## POLICY_BOUNDARY

Credential state is orthogonal to authority:

```text
Credential configured != Tool enabled
Credential configured != MCP activated
Credential configured != NETWORK allowed
Credential configured != Approval granted
Credential configured != lower Tool effect
Credential configured != semantic trust
```

The existing `PolicyEngine` and Approval routing run before credential
resolution/external use. Credential resolution cannot auto-activate an MCP
connection, expose a Tool, lower `DESTRUCTIVE`, or bypass a deny. A missing or
rejected credential is an execution failure, not a request to change Policy.

## VERIFICATION_BOUNDARY

Credential Foundation does not create a receipt or Verification engine:

```text
authenticated Provider Tool invocation
  -> existing ToolCall
  -> existing PolicyEngine / Approval
  -> existing ToolExecutor / Provider adapter
  -> existing durable receipt
  -> existing Verification / Evidence
```

The following remain distinct:

```text
Credential exists       != credential valid
Authentication succeeds != Tool result verified
OAuth authenticated     != Tool trusted
Secret stored           != permission granted
Tool success             != Verification PASS
```

Brave Search success remains an information result and must not manufacture a
Verification PASS. Credential-related evidence proves only bounded use and
non-leakage; it does not grant Semantic Authority.

## SECURITY_BLOCKERS

`FIRST_SLICE_SECURITY_PREREQUISITES: SATISFIED BY TARGETED EVIDENCE`.

The audit did not find plaintext secret persistence in Fielora storage, a
stored-secret Renderer readback, automatic FIPC payload logging, SecretBytes
Debug leakage, or current Authorization-header capture in receipts.

The authorized implementation satisfies these First Slice prerequisites:

1. Brave provider-lifetime secret ownership was replaced with exact
   per-execution resolution/use/drop.
2. The exact Fielora-owned binding includes the actual Tool-provider route,
   consumer, and slot; Provider code receives neither a store nor a ref.
3. Sentinel absence is asserted across arguments, observations, receipts,
   events, Verification evidence, errors, files, SQLite, Skill context, child
   context, and child environment.
4. Missing, deleted, unbound, mismatched consumer/slot/route, and store failure
   fail closed without an external request.
5. No FIPC DTO or UI was added or expanded.

MCP environment injection remains outside the implemented First Slice because of
the unresolved process-tree and stderr confidentiality boundary. OAuth and
generic credential UI similarly require separate security design.

## CHANGE_IMPACT

| Area | Candidate impact | Reason |
|---|---|---|
| This Candidate document | `LOW` | Factual update remains DRAFT/CANDIDATE/NOT FROZEN. |
| generic credential identity | `MEDIUM` | Additive opaque typed ref and target convention; existing model identity remains unchanged. |
| CredentialStore extension/facade | `MEDIUM` | Security-sensitive exact-use wrapper over existing Windows primitives; no backend rewrite required. |
| SecretBytes lifecycle | `MEDIUM` | Per-execution ownership/drop and tests; hardened zeroization is deferred. |
| ToolProvider binding | `HIGH` | Secret enters the general external Tool execution boundary for the first time; exact authority and fail-closed tests are mandatory. |
| Brave integration | `HIGH` | Production HTTP authentication becomes bindable; existing Policy/receipt boundary must remain unchanged and leak-free. |
| MCP environment future | `HIGH / DEFERRED` | Arbitrary process/process-tree environment, stderr, propagation, and trust boundary. |
| Renderer/FIPC UI future | `HIGH / DEFERRED` | Secret crosses JS/Electron/JSON and requires write-only UX and logging review. |
| durable credential metadata/bindings | `HIGH / STORAGE_CHANGE_REQUIRED` | Would require schema/migration and recovery/portable semantics; not needed for the proof Slice. |
| OAuth future | `HIGH / SEPARATE ARCHITECTURE` | Browser consent, callback, refresh/expiry/revocation, and provider-specific policy. |

Overall runtime Credential Foundation change is `HIGH` because managed secrets
now participate in external Tool execution. The Candidate update itself is
`LOW`; no Frozen/Baseline contract, schema, migration, dependency, UI, or FIPC
surface changed.

## FIRST_SLICE_RECOMMENDATION

`IMPLEMENTED_FIRST_CREDENTIAL_SLICE: GENERIC STATIC_SECRET BINDING + BRAVE SEARCH DETERMINISTIC CONSUMER`

The previously recommended Slice is implemented and targeted-validated. This
status does not authorize product activation or a subsequent Slice.

Implemented Slice:

1. Added an internal opaque `CredentialRef` and exact binding for
   `fielora.web/brave.search.v1/subscription_token`; the model ref is unchanged.
2. Added a thin typed facade over `CredentialStore`; no DB table,
   migration, UI, OAuth, or Model-facing Tool.
3. Composed explicit secure test bindings. The Model-visible
   `web.search` contract remains unchanged.
4. Resolves the secret only after existing Tool resolution and Policy/Approval,
   supplies it only to the Brave execution adapter, and drops it after use.
5. Removed only Brave's long-lived Provider secret; model credential
   preparation and unrelated Tools were not refactored.
6. Proved success, exact authority, rotation/revocation, fail-closed behavior,
   subagent isolation, and leak invariants with deterministic fixtures.
7. No generic product binding or explicit live-request authorization existed,
   so the optional live gate remains `BLOCKED_NO_CREDENTIAL` with zero public
   API requests.

No UI, MCP env, generic HTTP Provider, package/dependency, Marketplace,
credential registry, remote auth, or schema change belongs to this Slice.

## TARGETED_TEST_PLAN

The implementation includes targeted deterministic evidence for:

### Platform and identity

- put -> exists -> replace -> exists -> delete -> absent;
- correct Windows target derivation and namespace separation from existing
  `Fielora/provider/<id>` targets;
- empty/oversized/error mapping;
- `SecretBytes` Debug redaction and compile-time/runtime proof that it is not
  serialized or displayed;
- replacement is observed by the next execution; deletion yields
  `CREDENTIAL_MISSING` on the next execution.

### Authority and binding

- only `brave.search.v1/subscription_token` can use the bound ref;
- an unbound Provider, wrong provider ID, wrong slot, missing ref, and deleted
  ref all fail closed before network;
- Provider metadata and Tool arguments cannot select or override a ref;
- Provider code receives no unrestricted CredentialStore handle;
- credential presence does not change Tool exposure, effect, Policy decision,
  Approval, or Verification.

### Brave fixture

- success: expected sentinel arrives only in the sensitive authentication
  header and bounded provider-neutral results return;
- missing and deleted: `CREDENTIAL_MISSING`, request count zero;
- rejected 401/403: `CREDENTIAL_REJECTED` without response/request dumps;
- timeout/network failure: existing bounded provider-neutral failure;
- rotation: second execution uses replacement, not cached old bytes;
- bounded concurrent executions do not create an unbounded secret cache.

### Non-leakage

Use a unique sentinel and assert it is absent from:

- Model/system/Skill/subagent context;
- Tool schema and durable arguments;
- Tool observation and result;
- Agent events;
- durable Tool receipt and Verification evidence;
- FIPC/Core/adapter errors and captured logs;
- files, SQLite, `mcp.json`, Context Snapshots, and Artifacts.

No secret digest/prefix/last4 may be used as a substitute leak.

### Future MCP, not in the Slice

- ref maps to exactly one explicit environment variable;
- parent environment remains cleared;
- secret absent from argv, receipt, Agent events, and persisted stderr;
- process-tree cleanup and failure behavior;
- explicit acceptance that an admitted server/process tree can access the
  granted environment.

Implemented evidence includes:

- Platform identity/store lifecycle plus an actual Windows Credential Manager
  round trip with scoped cleanup;
- exact route/consumer/slot least-authority, rotation, revocation, store-error,
  and no-cache tests;
- Brave sensitive-header fixture coverage for success and bounded failure
  classes;
- real Core Policy/Approval ordering, one-read/one-call accounting, durable
  receipt/event/SQLite sentinel scans, and no manufactured Verification PASS;
- Project Skill metadata/lazy-load/context and sanitized command-environment
  sentinel scans;
- an actual read-only child AgentRun proving zero static-store reads and no
  parent static binding/secret inheritance;
- focused Rust tests, release Core build, workspace clippy, docs/contracts, and
  Core integration validation.

The broad `verify:dev:core` workspace unit stage also exposed an unrelated
`fielora-storage` migration test failure (`no such table: profiles`) in an
untouched file. The same exact failure was reproduced in a clean detached
worktree at baseline `cb30e080`; the affected credential/Core tests and later
clippy/release/integration gates passed. No unrelated storage repair was made.

## OPEN_QUESTIONS

1. Where should durable generic credential labels and binding metadata live
   once a human management UI is authorized? The First Slice deliberately
   avoids this schema decision.
2. Should a future `exists` implementation use a metadata-only WinCred probe
   to avoid copying the blob, or is the current immediate `SecretBytes` drop
   acceptable within the bounded Windows-first contract?
3. Should receipts record no auth fact at all or only
   `authenticated: true`? There is no demonstrated First Slice need to persist
   a credential or binding identifier.
4. What exact process-tree trust/sandbox statement is acceptable before MCP
   environment credentials are authorized? `env_clear` alone cannot stop an
   admitted server from propagating its own environment.
5. If generic metadata later becomes portable, how should a moved profile show
   a retained non-secret binding whose OS credential blob is absent?
6. Is Project-scoped binding ever necessary, or can V0.1 remain user-owned plus
   exact provider/connection binding? Do not introduce a grant hierarchy before
   a concrete flow requires it.
7. Should hardened zeroization be adopted later, given unavoidable copies in
   Windows APIs, Electron/FIPC, and HTTP libraries? This requires a focused
   defense-in-depth assessment rather than an isolated dependency addition.
8. When authenticated Tools are deliberately admitted to read-only subagents,
   what catalog/grant projection is needed while preserving the rule that the
   child never receives underlying bytes?

## EXPLICIT_NON_SCOPE

- no Credential product activation beyond the internal authorized first Slice;
- no TypeScript, UI, FIPC, Cargo dependency, schema, or migration change;
- no change to Settings, MCP config, Web config, or Frozen/Baseline documents;
- no Credential/Secret Agent or Runtime;
- no Model-facing credential Tool;
- no secret in argv;
- no MCP environment injection;
- no OAuth, service account, certificate, SSH key, browser session, or cookie;
- no Marketplace-global namespace, package manager, Plugin Runtime, or
  credential economy;
- no live paid/API request.
