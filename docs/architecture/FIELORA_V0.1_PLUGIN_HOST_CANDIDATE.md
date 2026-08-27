# Fielora V0.1 Plugin Host + SDK Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**First Declarative Local Unpacked Plugin Slice:** `IMPLEMENTED / VALIDATED`

**Executable Plugin Host:** `NOT IMPLEMENTED / NOT AUTHORIZED`

**Track:** subordinate to `RAPID_DESKTOP_EXECUTION_V0.1.md` and the canonical
`Model + Harness + Tools` Agent architecture

**Document Change Impact:** `LOW`

**Candidate First Slice Change Impact:** `MEDIUM`

This Candidate records the current Plugin reality, the boundary between a
Plugin package and existing Fielora systems, and the implemented First Slice
that proves declarative Skill contribution admission without executing
third-party Plugin code. It does not amend a Frozen or Baseline document,
authorize an executable Plugin Runtime, create a new Phase, or change the Rapid
Desktop route.

The current repository is authoritative. In particular, this Candidate uses
the post-Extension implementation reality: `ToolProvider`,
`RoutedToolExecutor`, Project Agent Skills, local stdio MCP, user-configured
run-scoped MCP, static credential mediation, durable ToolCall receipts, and the
existing Verification boundary are already implemented. Plugin must not
reimplement them.

Implemented First Slice facts:

```text
RECOMMENDED_FIRST_PLUGIN_SLICE:
A. DECLARATIVE LOCAL UNPACKED PLUGIN

FIRST CONTRIBUTION:
ONE STANDARD AGENT SKILL

FIRST-SLICE HOST NAME:
PLUGIN CONTRIBUTION HOST

EXECUTABLE_PLUGIN_HOST_DIRECTION:
PROCESS — DEFERRED, CONDITIONAL ON A REAL SANDBOX/RPC CHANGE IMPACT

PERSISTENCE:
NONE

MODEL REQUESTS:
0
```

---

# 1. CURRENT_PLUGIN_REALITY

Status meanings:

- `EXISTS`: the named Plugin behavior exists now.
- `PARTIAL`: an existing Fielora owner can receive the contribution, but the
  Plugin-specific bridge or required safety semantics do not exist.
- `ABSENT`: no current Plugin implementation provides the behavior. A build
  plugin, document mention, or adjacent primitive does not count.

| Item | Status | Current module / file | Existing semantic owner | Gap |
|---|---|---|---|---|
| Plugin manifest | `EXISTS` | `crates/fielora-agent/src/plugins.rs`: exact `fielora.json`, typed strict parser, 64 KiB read bound, identity/version/engine/path validation, and digest. Electron Forge `plugins` remains unrelated build tooling. | Product / Extension packaging | Only the First Slice declarative Skill subset exists; executable or additional contribution fields are rejected. |
| Plugin identity / version | `EXISTS` | `PluginManifest`, deterministic `publisher.plugin-name` validation, reserved `fielora` namespace, core SemVer validation, and minimum Fielora engine check. | Product / Extension packaging | Publisher remains an unverified namespace; signing and full SemVer ranges are absent. |
| Plugin source / trust | `EXISTS` | `PluginSourceKind::LocalUnpackedPlugin`, `PluginTrust::UntrustedLocalPlugin`, and additive `SkillSourceKind::Plugin`. | Product admission plus receiving domain | No signed/verified Publisher trust state exists; source/trust grant no authority. |
| Plugin root | `PARTIAL` | `AgentCoordinator::with_local_unpacked_plugin_roots` accepts only an explicit trusted caller/test-provided root; `plugins.rs` canonicalizes every root and contribution. | Product admission + Platform path mechanics | No user path picker, global directory, persistence, watcher, install, or automatic Project scan exists. |
| Passive discovery | `EXISTS` | `discover_local_unpacked_plugin` and `SkillCatalog::discover_with_local_unpacked_plugins` only read, parse, validate, canonicalize, digest, and enumerate declared Skills. | Product / Extension packaging | Discovery is an internal explicit-root entry only; there is no product activation surface. |
| Contribution admission | `EXISTS` | Bounded `PluginSnapshot` plus atomic pre-admission duplicate ID/path/name collision checks routes only declared standard Skills into `SkillCatalog`. | Product contribution admission, then receiving domain | Only Skill contributions are implemented. Tool/MCP/Command/Surface fields strictly reject. |
| Skill contribution | `EXISTS` | `crates/fielora-agent/src/skills.rs`: Plugin backing reuses the standard parser, resource inventory, `SkillCatalog`, `load_skill`, `ContextCompiler`, content digest, and existing Skill TOCTOU. | Harness.Ingress & Context + Harness.Orchestration | No Plugin-specific Skill Runtime exists. Resource reads beyond inventory and all execution remain outside this Slice. |
| ToolProvider contribution | `PARTIAL` | `ToolProvider`, `ProviderToolDefinition`, `coding_tool_catalog_with_providers`, `RoutedToolExecutor` in `crates/fielora-agent/src/lib.rs`. | Tools, with Harness-controlled selection and execution | A Provider can be registered by Fielora composition, but no Plugin manifest may declare or instantiate one. Executable Plugin admission and sandboxing are absent. |
| MCP contribution | `PARTIAL` | `McpStdioToolProvider`, `McpConnectionSnapshot`, run-scoped activation, current Settings/Run UI. | Tools MCP adapter + Harness.Governance/Execution | User-owned `mcp.json` is the only product config source. No Plugin declaration converts into an `McpConnectionDefinition`; Plugin admission cannot activate MCP. |
| Context contribution | `PARTIAL` | `ContextCompiler`, Context Snapshots, Skill admission, file/input admission in `AgentCoordinator`. | Harness.Ingress & Context | There is no generic Plugin Context Provider contract. No Plugin may append directly to Model/system context. |
| Command contribution | `ABSENT` | FIPC `command.*` methods and Agent Tools are fixed, typed boundaries; Desktop buttons call explicit handlers. | Product actions or Harness/Tools, depending on effect | There is no command registry or Plugin command admission. Existing FIPC is intentionally not an untyped extension point. |
| Surface contribution | `ABSENT` | React surfaces are statically composed; Settings has a real MCP category; Desktop has no Extensions or Plugins page. | Desktop Product UI | No declarative extension point, isolated Plugin view, placement contract, or UI capability bridge exists. |
| Credential requirement | `PARTIAL` | `StaticCredentialRequirement`, `StaticCredentialBinding`, `StaticCredentialMediator`, `CredentialRef`, and Local MCP env binding. | Human configuration + Harness.Governance/Execution + Platform | Exact Fielora-owned binding exists, but Plugin manifests cannot declare requirements. Plugin code receives neither `CredentialStore` nor arbitrary refs. |
| Sandbox / executable host | `ABSENT` | `ManagedChild` supplies `env_clear`, stdio, shutdown, and Windows Job Object cleanup; Electron WebContents use sandboxed preferences. | Future Platform host beneath receiving domains | `ManagedChild` explicitly is not a confidentiality or filesystem/network sandbox. No Plugin RPC, restricted token/AppContainer, capability imports, resource quotas, or Plugin lifecycle exists. Electron WebContents security is not an executable Plugin host. |
| Signing | `ABSENT` | No Plugin signature or Publisher verification implementation. | Future package trust infrastructure | Package signature, certificate identity, revocation, and verified Publisher status are undefined. Signing must not imply permission. |
| Install | `ABSENT` | Electron Forge packages Fielora itself; portable profile import/export moves bounded Fielora data. | Future Product / package acquisition | No Plugin installer, package extraction, Git acquisition, registry, installation registry, or uninstall flow exists. |
| Update | `ABSENT` | No Plugin version watcher or update service. | Future Product / package lifecycle | No update channel, integrity recheck, rollback, or changed-requirements review exists. |
| Diagnostics | `PARTIAL` | `PluginError` provides bounded fail-closed admission codes; existing Skill/load facts carry stable Plugin provenance. | Each current domain plus Product UI | No Plugin diagnostics UI or persisted read model exists, and absolute roots are intentionally excluded. |
| SDK / JSON Schema | `PARTIAL` | Public typed Rust manifest/snapshot contracts, deterministic parser/validator, repository fixture, and `docs/extensions/LOCAL_UNPACKED_PLUGIN_SKILL_V0.1.md`. | Developer contract / tooling | JSON Schema, CLI, scaffold, package builder, test kit, and public runtime SDK are deferred; no dependency was added. |
| Marketplace | `ABSENT` | Marketplace is explicitly outside the current Rapid Desktop route. | Future discovery/trust infrastructure | No catalog, Publisher economy, ratings, payments, ranking, or registry exists; none is required by this Candidate. |

Additional repository facts:

- Settings already contains a dedicated MCP page and an AgentRun can show
  run-scoped MCP state. This is not an Extension or Plugin management surface.
- Opening a Project currently discovers standard Project Skills, but it does
  not scan Project MCP config. A future Plugin path must follow the stricter
  rule: opening a Project must not discover and execute Plugin code.
- The active Tool catalog is bounded to built-ins plus at most 16 registered
  Providers and 32 Tools per Provider. Catalog assembly is real, but it is not
  a large persistent Plugin registry.
- Existing `semver` and AJV records are transitive dependencies. Fielora does
  not own their APIs and must not rely on them without an explicit direct
  dependency decision.

---

# 2. PLUGIN_DEFINITION

```text
Plugin
= package / contribution mechanism
```

Plugin is not a Tool protocol, Agent, Skill, MCP replacement, permission
system, execution ledger, Verification engine, or Semantic Authority.

The concept boundary is:

| Concept | Meaning |
|---|---|
| Skill | Instructions and resources describing how to do something. |
| MCP | A standardized external capability protocol. |
| ToolProvider | The executable capability backend seam already used by Fielora. |
| Plugin | A package that declares contributions to existing Fielora owners. |

A future package may contain Skills, Tool Providers, MCP declarations,
Commands, Context providers, Surfaces, file handlers, Artifact handlers, and
Settings metadata. The package does not own the runtime semantics of those
contributions.

Example, as a boundary rather than an implemented product:

```text
Figma Plugin
├── Skill: design-review        -> existing Skill path
├── MCP declaration             -> existing MCP / ToolProvider path
├── Preview surface             -> future Desktop extension point
└── Settings metadata           -> future declared Settings contribution
```

---

# 3. ARCHITECTURE_BOUNDARY

The top-level architecture remains exactly:

```text
Model
+
Harness
+
Tools
```

Plugin enters before existing domain owners:

```text
Explicitly selected Plugin package
  -> bounded manifest read / parse / validate / digest
  -> contribution admission
       ├── Skill       -> existing SkillCatalog / ContextCompiler
       ├── Tool        -> existing ToolProvider / Tool catalog
       ├── MCP         -> existing McpConnectionDefinition / MCP provider
       ├── Context     -> existing Context admission and Snapshot
       ├── Command     -> admitted Product action or Tool
       └── Surface     -> future declared Desktop extension point
```

Executable contribution flow, if authorized in a later high-impact change:

```text
Plugin executable contribution
  -> admitted ToolProvider
  -> existing provider-neutral Tool catalog
  -> Harness selection / lazy Model exposure
  -> existing PolicyEngine / Approval
  -> existing durable AgentToolCall
  -> existing RoutedToolExecutor
  -> selected backend
  -> existing ToolCall receipt / event
  -> existing Verification / Evidence interpretation
```

Forbidden parallel paths:

```text
Plugin -> own Agent Runtime
Plugin -> own Permission or Approval engine
Plugin -> own ToolCall ledger or ExecutionReceipt hierarchy
Plugin -> own Verification engine
Plugin -> direct Core DB mutation
Plugin -> unrestricted Electron Main
Plugin -> direct CredentialStore
Plugin -> direct system prompt append
```

`Plugin Contribution Host` is the accurate First Slice term. It must not be
called a general executable Plugin Runtime.

---

# 4. DOMAIN_OWNERSHIP

| Domain | Owner | Plugin relationship |
|---|---|---|
| Package identity, manifest, source, package snapshot | Product / Extension packaging | Defines and admits declarations only. It does not execute domain behavior. |
| Skill and declarative Context | Harness.Ingress & Context + Harness.Orchestration | Existing metadata-first catalog, lazy loading, trust, bounds, and Context Snapshot remain authoritative. |
| Executable capability | Tools | Plugin executable contributions become existing `ToolProvider` backends. |
| Tool selection and exposure | Harness.Orchestration | Plugin cannot expose all Tools or select Tools for the Model by itself. |
| Policy and Approval | Harness.Governance | Existing effect, permission preset, Approval routing, invariants, and human authority remain authoritative. |
| Tool execution lifecycle | Harness.Execution | Existing AgentRun/ToolCall lifecycle and `RoutedToolExecutor` boundary are reused. |
| Evidence and completion | Harness.Verification & Evidence | Existing receipt, Verification receipt, workspace revision, and completion authority are reused. |
| MCP protocol and transport | Tools MCP adapter + Platform process primitive | A Plugin declaration can only become existing MCP configuration after explicit admission; install never activates it. |
| Credential storage | Platform | Plugin declares at most a future requirement; Fielora configuration binds and the existing mediator resolves exact bytes. |
| Desktop Surface | Desktop Product UI | Only declared, bounded extension points may be added later. |
| Filesystem/process/sandbox mechanics | Platform | Supplies primitives beneath a host; does not grant Plugin authority. |

No `Plugin subsystem` owns all rows in this table.

---

# 5. SOURCE_AND_TRUST

Long-term source analysis:

| Source | Meaning | Current decision |
|---|---|---|
| `BUILTIN` | Shipped as part of Fielora and reviewed with the product. | Future taxonomy only; current built-in Tools/Skills are not repackaged. |
| `LOCAL_UNPACKED` | User/test supplies an existing directory path. | **First Slice source.** Explicit path only, unsigned, untrusted. |
| `LOCAL_PACKAGE` | User selects a package archive. | Deferred; requires safe extraction, integrity, install, and update semantics. |
| `OFFICIAL_REGISTRY` | Registry-distributed package with official governance. | Deferred. Official does not imply permission. |
| `COMMUNITY_REGISTRY` | Community-distributed package. | Deferred; signing, Publisher identity, review, and supply chain are unresolved. |
| `GIT` | Package acquired from a pinned Git source. | Deferred; Project opening must never imply Git Plugin admission. |

First Slice facts:

```text
plugin source = LOCAL_UNPACKED_PLUGIN
plugin trust  = UNTRUSTED_LOCAL_PLUGIN
```

The source path is provided explicitly by a test-owned or later human-owned
admission action. There is no watcher or automatic scan of:

```text
<project>/.fielora/plugins
<project>/plugins
<PlatformPaths.config_dir>/plugins
<PlatformPaths.data_dir>/plugins
```

Opening a cloned Project must not discover, admit, or execute Plugin code.
Local selection means that the user chose a path; it does not mean the package,
Publisher, instructions, or code are trusted.

`publisher` in an unsigned local manifest is self-asserted display/identity
metadata. It is not a verified Publisher fact. Future signing states such as
unsigned local, signed package, verified Publisher, and official must remain
orthogonal to permission and Semantic Authority.

---

# 6. MANIFEST_CANDIDATE

## 6.1 File name

No current Fielora runtime manifest convention exists. `.fielora` is already a
portable profile archive extension, and Electron Forge Plugin configuration is
build-only. The Candidate therefore recommends, but does not freeze:

```text
fielora.json
```

The name is visible in an unpacked package, uses ordinary UTF-8 JSON, supports
editor JSON Schema association, and does not imply a binary or hidden
executable format.

## 6.2 Minimal shape

```json
{
  "id": "example.presentation",
  "name": "Example Presentation",
  "version": "1.0.0",
  "publisher": "example",
  "engines": {
    "fielora": ">=0.1"
  },
  "contributes": {
    "skills": [
      "skills/presentation-design"
    ]
  }
}
```

First Slice rules:

- exact UTF-8 JSON file, maximum 64 KiB;
- all six top-level fields are required;
- unknown top-level, `engines`, `contributes`, or contribution fields fail
  closed as `PLUGIN_MANIFEST_UNSUPPORTED` rather than being silently given
  semantics;
- `contributes.skills` contains 1 to 16 unique relative directory paths;
- each path is at most 512 Unicode scalar values, uses `/` as manifest
  separator, and rejects absolute paths, empty/dot segments, `..`, NUL, and
  drive/UNC forms;
- each admitted directory must contain exact-case `SKILL.md`;
- no command, executable, MCP, permission, credential, Surface, script, or
  activation field is accepted in the First Slice.

Unknown standard Skill frontmatter remains governed by the existing Skill
parser: unsupported fields are safely ignored and receive no execution
semantics. This is separate from the strict Fielora package manifest.

## 6.3 Plugin identity

Candidate identity:

```text
publisher.plugin-name
```

First Slice validation:

- total 3 to 128 ASCII bytes;
- exactly two lower-case dot-separated segments;
- each segment starts with `[a-z0-9]` and then uses only lower-case ASCII
  letters, digits, or `-`;
- no empty segment, leading/trailing hyphen, slash, backslash, colon, whitespace,
  percent-encoding, or case folding;
- `publisher` must equal the first ID segment;
- `fielora` is a reserved Publisher segment for product-owned packages and is
  rejected for `LOCAL_UNPACKED` third-party admission;
- duplicate Plugin IDs in one admission set fail closed before any
  contribution is added.

This is stable non-secret identity, not a Marketplace certificate identity.

## 6.4 Version and engine compatibility

The repository has no direct production SemVer dependency. Rust `semver` and
Node `semver` appear only through transitive dependency trees, which are not a
supported Fielora API. First Slice should add no dependency and should not
implement a full range solver.

Minimum deterministic subset:

- `version` accepts bounded SemVer core `MAJOR.MINOR.PATCH` with decimal
  non-negative components and no leading zero ambiguity;
- pre-release/build metadata and non-core version strings are rejected in the
  First Slice rather than compared incorrectly;
- `engines.fielora` accepts only `>=MAJOR.MINOR` or
  `>=MAJOR.MINOR.PATCH` for the initial proof;
- Fielora compares its authoritative product version tuple with that minimum;
- unsupported range grammar fails closed as `PLUGIN_ENGINE_RANGE_UNSUPPORTED`;
- a higher required minimum fails as `PLUGIN_ENGINE_INCOMPATIBLE`; there is no
  automatic fallback.

Engine compatibility is a package claim and admission constraint. It is not
Trust, Permission, Verification, or a Provider capability grant. A later need
for full SemVer ranges must make a direct dependency/API decision instead of
quietly using a transitive package.

## 6.5 JSON Schema

A checked-in JSON Schema is worthwhile for editor completion and deterministic
developer feedback, but it is not a Runtime or source of authority. The typed
Rust parser/validator remains runtime-authoritative. A First Slice schema must
describe exactly the bounded subset above, reject additional properties, and
be tested against the same valid/invalid fixtures as the parser.

No schema generator currently exists. The implementation Candidate may use a
small checked-in Draft 2020-12 schema plus parser/schema parity tests without
adding AJV, `jsonschema`, or `schemars` as a production dependency.

---

# 7. CONTRIBUTION_MODEL

The First Slice has three distinct states:

```text
DISCOVERED
  manifest bytes read, parsed, validated, and digested

ADMITTED
  engine/path/collision/snapshot checks passed and Skill metadata entered the
  existing catalog

SKILL_LOADED
  existing load_skill revalidated the snapshot and admitted the selected body
  through ContextCompiler
```

`Discovered != Admitted != Loaded`. Discovery performs only read, parse,
validate, digest, and contribution listing. It performs zero process spawn,
MCP activation, credential resolution, Project write, Tool catalog mutation,
Model request, or Model-context body injection.

## 7.1 Snapshot and digest

Discovery calculates:

```text
manifest_digest = SHA-256(exact fielora.json bytes)

plugin_snapshot_digest = SHA-256(
  versioned domain separator
  + manifest_digest
  + ordered selected contribution kind
  + normalized relative contribution path
  + contribution content digest
)
```

Only declared, selected contribution identities/digests are included. The host
must not recursively hash unrelated package files.

Immediately before contribution admission/load, the host re-resolves the exact
manifest path and recomputes its digest. A manifest change fails closed as
`PLUGIN_CHANGED`. The existing Skill loader separately revalidates the
canonical `SKILL.md` path and exact digest and may return existing
`AGENT_SKILL_CHANGED`. Either result requires rediscovery before a new version
can be admitted.

Plugin update therefore means a changed manifest or contribution digest; the
previous snapshot becomes invalid. There is no watcher or auto-update. Future
permission or credential-requirement changes require new human review.

## 7.2 Path containment

The explicit Plugin root, exact manifest path, each contribution directory,
and each `SKILL.md` are canonicalized. Every final path must remain inside the
same canonical Plugin root. Reject:

- `..` or absolute-path escape;
- symlink, Windows junction, or reparse-point escape;
- missing/wrong-case `SKILL.md`;
- a path whose canonical identity changes between discovery and load.

Implementation should factor or reuse the existing Skill canonical-containment
behavior rather than create a third pathname policy. Reuse means common tested
mechanics, not weakening Project Skill roots or treating a Plugin root as a
Project root.

## 7.3 Collision

Admission is fail-closed before catalog mutation:

- Plugin Skill versus built-in Skill: reject Plugin contribution;
- Plugin Skill versus Project Skill: reject Plugin contribution;
- Plugin Skill versus another Plugin Skill: reject the conflicting admission
  set;
- duplicate Plugin ID: reject the admission set;
- duplicate contribution path inside one manifest: reject the manifest.

There is no precedence or first-found-wins rule. Internal metadata may retain
`plugin_id + standard Skill name`, but Fielora must not rewrite the upstream
`SKILL.md` name or invent a Fielora-only Skill dialect.

## 7.4 Model and Tool visibility

After admission, the initial Model context sees only the existing Tier-1 Skill
projection: bounded name, description, source, trust, and version. It does not
see the manifest body, package path, Publisher internals, manifest digest, or
full `SKILL.md` body.

The First Slice Tool catalog is exactly unchanged. Plugin discovery/admission
adds no Tool, changes no Tool effect, changes no Policy decision, and activates
no MCP connection.

---

# 8. SKILL_CONTRIBUTION

The only First Slice contribution is a normal directory containing standard
`SKILL.md`:

```text
plugin/
├── fielora.json
└── skills/
   └── fixture-plugin-skill/
      └── SKILL.md
```

The adapter extends existing Skill catalog assembly; it does not create a
`PluginSkillRuntime`.

Required projection:

```text
source_kind = PLUGIN
plugin_id
plugin_version
plugin_source = LOCAL_UNPACKED_PLUGIN
plugin_trust = UNTRUSTED_LOCAL_PLUGIN
skill_trust = UNTRUSTED_LOCAL_PLUGIN
plugin_manifest_digest
plugin_snapshot_digest
existing SKILL.md content_digest
```

The existing behavior remains authoritative:

- standard frontmatter parsing for `name`, `description`, `license`,
  `compatibility`, `metadata`, and advisory `allowed-tools`;
- metadata-only discovery before selection;
- lazy body read only through `load_skill`;
- existing `ContextCompiler` budget, untrusted wrapper, and content hash;
- the current wrapper text that says `untrusted project context` must be
  minimally generalized to the admitted Skill source/trust so a Plugin Skill
  is not mislabeled as Project content; this extends the existing compiler and
  does not create another Context loader;
- resources under `scripts`, `references`, and `assets` are bounded path
  inventory only and are not automatically loaded or executed;
- `allowed-tools` is advisory and grants no Tool exposure or permission;
- instructions that request shell, install, network, file write, external
  renderer, subagent, MCP, or credentials remain untrusted text.

The current Skill-load ToolCall/receipt path should be extended with the Plugin
source facts above. Do not add `PluginReceipt`. Loading a Plugin Skill must
produce:

```text
0 automatic Tool calls
0 Permission grants
0 CredentialStore reads
0 MCP activations
0 child AgentRuns
0 script executions
```

The Skill remains portable: removing the outer `fielora.json` leaves an
ordinary standard Agent Skill usable by another compatible host.

---

# 9. TOOL_PROVIDER_FUTURE_BOUNDARY

A future Plugin may declare a Tool Provider contribution only after a separate
high-impact executable-host Change Impact. Its Tools must become ordinary
admitted `ProviderToolDefinition`/`ToolSpec` projections and run through the
current `RoutedToolExecutor`.

Plugin code cannot:

- call `ToolRuntime` internals directly;
- author Policy or Approval decisions;
- persist ToolCall state or receipts;
- choose its own trusted `AgentToolEffect` from untrusted metadata;
- mutate Core/SQLite directly;
- mint Verification or completion.

Current large-catalog behavior remains a later delta. Fielora has bounded
Provider discovery and Harness-controlled model exposure, but no persistent
catalog index, tool-level enablement, or lazy Plugin Provider activation.

---

# 10. MCP_FUTURE_BOUNDARY

A future declarative MCP contribution must convert into the existing bounded
`McpConnectionDefinition` semantics:

```text
Plugin MCP declaration
  -> passive Plugin contribution admission
  -> admitted user-owned MCP definition
  -> explicit activation for an AgentRun
  -> existing PROCESS Policy / Approval
  -> existing McpStdioToolProvider
  -> existing Tool catalog / RoutedToolExecutor / receipts / Verification
```

Installing or admitting a Plugin must not start an MCP process, discover MCP
Tools, resolve credentials, or create a durable active flag. Project-controlled
Plugin content must not become an executable MCP command merely because the
Project was opened.

Local executable trust, credential binding, package provenance, and supply
chain make this a later `HIGH` change even though the MCP transport already
exists.

---

# 11. CONTEXT_FUTURE_BOUNDARY

A declarative Context contribution must enter the existing Context admission
path with explicit source/trust, size/token budget, digest, and Context
Snapshot facts. It cannot append directly to a system prompt.

An executable Context Provider is executable Plugin code and therefore waits
for the same sandbox host decision as Tool Providers. Its output remains
untrusted context data and does not gain Semantic Authority from package
identity, signature, or execution success.

---

# 12. SURFACE_FUTURE_BOUNDARY

Potential declarative extension points are limited candidates:

- Settings section;
- inspector;
- preview;
- context action;
- Artifact surface.

No Plugin may insert arbitrary primary navigation, run unrestricted React/Node
code in the trusted Renderer, load a Fielora preload, access Electron Main,
obtain a generic FIPC bridge, or access Core DB. Any future custom view needs a
separate high-impact design with fixed placement, isolated content, narrow
message DTOs, capability mediation, CSP, lifecycle, and Human Experience
review.

Future Commands must also distinguish:

```text
declarative command -> invokes one admitted Product action or Tool
executable command  -> future sandbox host, then admitted action/Tool path
```

A command label or manifest declaration is never arbitrary code execution.

---

# 13. CREDENTIAL_BOUNDARY

The First Slice manifest has no credential field and reads no credential.

Long-term, a Plugin may declare a non-secret requirement such as
`github.token`, but the declaration is only requirement metadata. The Plugin
cannot store a secret, enumerate references, choose an arbitrary
`credential_ref`, receive a `CredentialStore`, expose bytes to a Model, or
cause automatic binding.

Actual use remains:

```text
trusted human/Fielora configuration
  -> exact Fielora-owned provider/consumer/slot binding
  -> existing Policy / Approval
  -> StaticCredentialMediator
  -> SecretBytes
  -> selected admitted adapter/process environment
  -> drop
```

Plugin installed/discovered/signed does not mean credential access. An
admitted process intentionally given an environment secret can read and
propagate it; the existing Job Object is lifecycle containment, not a secret
sandbox.

---

# 14. EXECUTABLE_HOST_DIRECTION

| Option | Repository fit | Security result | Candidate decision |
|---|---|---|---|
| In-process JavaScript or Rust | No Plugin ABI exists; trusted Core/Electron memory and APIs would be directly reachable. | Unacceptable default: broad filesystem, process, credential, state, and crash impact. | Reject as the default direction. |
| Worker / child process | `ManagedChild`, bounded stdio, cancellation, and Windows Job Object cleanup are real reusable mechanics. | Better crash/lifecycle isolation, but current child runs with user authority and is explicitly not a sandbox. RPC, restricted OS identity, filesystem/network mediation, quotas, and integrity are missing. | **Long-term direction: PROCESS, only after the blockers below are solved.** |
| WASM sandbox | Capability imports and memory/fuel bounds could provide a stronger default. | No WASM runtime, ABI, component model decision, SDK, or ecosystem exists in the repo; dependency and host complexity are high. | Retain as an alternative for compute-only contributions; do not introduce it speculatively. |

```text
EXECUTABLE_PLUGIN_HOST_DIRECTION: PROCESS
CURRENT_EXECUTABLE_PLUGIN_IMPLEMENTATION: DEFERRED / NOT AUTHORIZED
```

`PROCESS` here means a future Fielora-owned, capability-mediated host with
bounded RPC and a reviewed OS sandbox posture. It does not mean launching an
arbitrary executable with today's user privileges and calling that safe.

Hard invariant:

> Third-party Plugin code MUST NOT run directly with unrestricted Electron Main
> privileges.

---

# 15. PERSISTENCE_DECISION

| Option | First Slice result |
|---|---|
| Explicit path -> ephemeral runtime snapshot | **Selected.** Sufficient to prove the contribution host. |
| User-level installation registry/config | Deferred. Requires product management, missing-path recovery, update, and portable-profile semantics. |
| Database tables | Rejected for the First Slice. No demonstrated query or lifecycle requires a migration. |

```text
FIRST_SLICE_PERSISTENCE: NONE
SCHEMA / MIGRATION: NONE
```

The Plugin root remains an internal ephemeral path and must not enter Model
context or durable Skill receipts. Only stable Plugin/source/digest facts are
eligible for the existing receipt/context metadata.

---

# 16. SDK_DECISION

The first SDK is a contract kit, not a large npm/crate or executable runtime:

```text
MINIMUM SDK v0
├── typed manifest and snapshot contracts
├── deterministic parser/validator
├── one repository-owned example/fixture Plugin
└── short package authoring documentation
```

A checked-in JSON Schema was optional for this Slice and is deferred. The
typed Rust parser is authoritative; adding a schema without a zero-dependency
parity check would create a second, potentially drifting contract.

Deferred SDK features:

- scaffolding CLI;
- `fielora plugin validate` or `plugin test` command;
- runtime library/ABI;
- debugger;
- package builder;
- Publisher/signing client;
- registry/Marketplace client.

The First Slice should add no dependency. It can reuse `serde`, `serde_json`,
the existing SHA-256 implementation, Skill parsing, canonical path checks, and
test infrastructure. A transitive SemVer/AJV package does not count as an
available SDK dependency.

Candidate repository shape for a future authorized implementation:

```text
docs/extension/
├── fielora.plugin.schema.json
└── LOCAL_UNPACKED_PLUGIN.md

tests/fixtures/plugins/skill-only/
├── fielora.json
└── skills/fixture-plugin-skill/SKILL.md
```

Exact locations remain implementation-level and are not frozen here.

---

# 17. CONTRACT_DELTA_CANDIDATE

Illustrative minimum types, after reusing existing Skill and capability
contracts:

```text
PluginManifest
  id
  name
  version
  publisher
  engines.fielora
  contributes.skills[]

PluginIdentity
  id
  version

PluginSource
  LOCAL_UNPACKED_PLUGIN       # only First Slice value

PluginTrust
  UNTRUSTED_LOCAL_PLUGIN      # only First Slice value

PluginSkillContribution
  normalized_relative_directory

PluginContribution
  kind = SKILL                 # only First Slice value
  skill = PluginSkillContribution

PluginSnapshot
  identity
  source / trust
  manifest_digest
  selected contribution identities/digests
  plugin_snapshot_digest
```

Required reuse/extension:

- extend existing `SkillSourceKind` with a Plugin source instead of inventing
  another Skill catalog;
- extend existing `SkillCatalogEntry`/receipt facts with Plugin origin,
  manifest digest, and snapshot digest;
- retain the existing `CapabilityDescriptor` semantic for future executable
  capabilities and the current `ToolSpec`/`ToolProvider` execution projection;
- do not misuse Frozen `ResourceRef` for a local Plugin filesystem path;
- do not extend `ToolSourceKind` in the Skill-only Slice because the Tool
  catalog must remain unchanged;
- do not create `PluginReceipt`, `PluginPermission`, `PluginVerification`,
  `PluginAgentRun`, or Plugin persistence tables.

Type names are Candidate names, not a frozen class layout.

---

# 18. SECURITY_MODEL

First Slice security properties:

- explicit/test-owned Plugin root only;
- passive exact-byte manifest read and digest;
- strict bounded typed parsing;
- canonical containment for manifest and declared Skill;
- manifest and Skill TOCTOU fail-closed;
- untrusted Plugin/package/Skill source retained;
- collision rejection before catalog mutation;
- Skill body remains lazy and ContextCompiler-bounded;
- no code, resource, script, command, MCP, Tool, credential, network, or Model
  activation from discovery;
- no Tool catalog/effect/Policy/Approval/Verification change;
- no Project Plugin auto-scan;
- no persistence, FIPC, UI, Electron Main, or DB access.

Executable Plugin direction remains blocked until a separate Change Impact can
prove all of the following:

1. third-party code does not run in unrestricted Electron Main, trusted
   Renderer, or Rust Core memory;
2. the host has a bounded versioned RPC/ABI and rejects unknown methods;
3. filesystem, network, process, environment, credential, and app access are
   capability-mediated rather than inherited by default;
4. CPU, memory, output, process-tree, timeout, cancellation, crash, and cleanup
   bounds exist;
5. package integrity, source identity, update invalidation, and diagnostics are
   defined;
6. Plugin code cannot receive `CredentialStore`, write Core DB, bypass
   `ToolProvider`, append Model context, or mint receipts/Verification;
7. executable and Surface contributions have independent trust and human
   review semantics;
8. package signing remains orthogonal to Permission and Semantic Authority.

The current `ManagedChild`/Job Object and Electron sandbox preferences satisfy
none of these as a complete Plugin sandbox by themselves.

---

# 19. CHANGE_IMPACT

| Candidate change | Level | Reason |
|---|---|---|
| This docs-only Candidate | `LOW` | One non-frozen document; no code, dependency, schema, migration, UI, network, credential, or execution change. |
| Declarative manifest parser/admission | `MEDIUM` | Admits untrusted package metadata and local paths; requires bounds, containment, digest, TOCTOU, collision, and engine checks. |
| Standard Skill contribution | `MEDIUM` | Adds untrusted instructions to the existing lazy Context path while preserving permission isolation. |
| MCP contribution | `HIGH` | A package can propose a local executable/process configuration; requires explicit human admission and existing PROCESS Approval. |
| Executable ToolProvider | `HIGH` | Runs third-party code and touches sandbox, RPC, resources, supply chain, and lifecycle. |
| Third-party process host | `HIGH` | Current ManagedChild is not a sandbox; OS and capability mediation are unresolved. |
| WASM host | `HIGH` | Adds a runtime/ABI/dependency and new capability-import security surface. |
| Context Provider code | `HIGH` | Executable untrusted code can influence Model context and needs host/admission boundaries. |
| Surface/UI contribution | `HIGH` | Affects trusted Renderer/Electron/FIPC/product placement and requires isolation plus Human review. |
| Credential requirement/use | `HIGH` | A package can request secret-backed capability; binding, process trust, rotation, and leakage review are required. |
| Installer/package extraction | `HIGH` | Filesystem mutation, archive safety, integrity, provenance, rollback, and uninstall semantics. |
| Signing/update | `HIGH` | Publisher identity, integrity, revocation, requirement changes, rollback, and human review. |
| Marketplace | `OUT OF CURRENT SCOPE` | Discovery/economy is not required to prove contribution architecture. |

---

# 20. FIRST_SLICE_RECOMMENDATION

```text
FIRST PLUGIN SLICE

Explicit/test-owned LOCAL_UNPACKED Plugin root
+ exact bounded fielora.json
+ one standard Agent Skill contribution
+ passive manifest discovery
+ explicit contribution admission
+ existing SkillCatalog metadata projection
+ existing load_skill / ContextCompiler lazy body
+ Plugin source/trust/digest/snapshot/TOCTOU facts
+ collision and canonical containment
+ zero executable Plugin code
+ zero Tool catalog delta
+ zero MCP activation
+ zero Credential read
+ zero UI/FIPC
+ zero persistence/migration
+ zero new dependency
+ zero Model request
```

Fixture proof:

```text
plugin-fixture/
├── fielora.json
└── skills/
   └── fixture-plugin-skill/
      └── SKILL.md       # contains a unique body sentinel

discover manifest
  -> admit one Skill metadata entry
  -> list_skills shows bounded Plugin metadata
  -> initial context does not contain the sentinel
  -> load_skill("fixture-plugin-skill")
  -> existing ContextCompiler admits the sentinel body
```

This Slice does not prove arbitrary Plugin-code execution. It proves the more
foundational statement:

> A third-party package can contribute an existing Fielora extension primitive
> without receiving additional authority and without creating a special Agent
> branch.

Executable Plugin work is not the next necessary proof. Once the declarative
package boundary, snapshots, and receiving-domain ownership are correct,
ToolProvider, MCP, Context, Command, and Surface can be evaluated one
contribution type at a time.

An optional later Reality proof may place the already validated DeckForge
`presentation-structure` Skill bytes unchanged inside a temporary manifest.
It must use a pinned local snapshot, make zero Model requests, require no new
public fetch, and commit no third-party files. It is not required by the First
Slice engineering proof.

---

# 21. TARGETED_TEST_PLAN

## Manifest

- valid minimal manifest;
- missing each required field;
- invalid/mismatched Publisher and ID;
- uppercase/path/control-character/collision ID;
- invalid Plugin version;
- supported and unsupported engine range;
- engine incompatible;
- oversized/non-UTF-8/deep manifest;
- unknown field and unknown contribution type;
- empty/oversized/duplicate Skill contribution.

## Discovery and admission

- explicit path only; opening a Project performs no Plugin scan;
- discovery produces manifest and snapshot digests;
- discovery performs 0 process starts, 0 MCP requests, 0 credential reads,
  0 Model requests, 0 writes, and 0 Tool changes;
- admitted metadata retains Plugin identity/source/trust/version/digests;
- manifest path and full body are absent from initial Model context.

## Skill contribution

- standard `SKILL.md` name/description discovery;
- `license`, `compatibility`, `metadata`, and `allowed-tools` preserve current
  supported/advisory semantics;
- body sentinel appears only after existing `load_skill`;
- references/scripts/assets remain inventory only and are not loaded/executed;
- ContextCompiler size/truncation/digest behavior remains unchanged;
- existing Skill-load receipt is extended, with no Plugin receipt hierarchy.

## Path and TOCTOU

- valid relative directory;
- `..`, absolute, drive, UNC, symlink, junction/reparse escape;
- missing/wrong-case `SKILL.md`;
- manifest mutation after discovery -> `PLUGIN_CHANGED`;
- rediscovery -> new snapshot -> load succeeds;
- Skill mutation after discovery -> existing `AGENT_SKILL_CHANGED`;
- unrelated undeclared file mutation does not affect the snapshot.

## Collision

- Plugin Skill versus built-in;
- Plugin Skill versus Project Skill;
- Plugin Skill versus another Plugin;
- duplicate Plugin ID;
- duplicate contribution path;
- no first-found-wins and no upstream Skill-name rewrite.

## Authority isolation

Use a Skill body that instructs shell execution, package install, network
fetch, credential read, MCP activation, file writes, and subagent delegation.
Loading it must prove:

```text
0 automatic Tool calls
0 Permission grants
0 credential reads
0 MCP activation
0 child AgentRuns
0 writes/process/network
0 Verification receipts
```

## Regression

- built-in Skills and Project Skills retain current behavior;
- `ToolProvider` catalog is byte/fact-equivalent before and after Plugin Skill
  admission;
- MCP connection/config/activation tests remain unchanged;
- Credential binding tests show zero store access;
- Web, File, Artifact, Coding, Policy, durable ToolCall receipt, and
  Verification boundaries retain current results;
- targeted Rust tests, Clippy for touched crates, rustfmt, Contracts current,
  Docs lane, and `git diff --check`;
- no Desktop E2E, packaged smoke, full premerge, or live network/model Gate
  unless a later authorized implementation crosses those boundaries.

---

# 22. OPEN_QUESTIONS

1. Should the manifest name remain `fielora.json` after implementation review,
   or should a future package format require a distinct archive-level name?
2. Is the First Slice minimum engine grammar sufficient, or does the first
   real external package justify a direct SemVer dependency and full range
   contract?
3. Which authoritative release version feeds `engines.fielora`: workspace
   package version, Desktop product version, or a future extension API version?
4. Should Plugin admission be atomic per Plugin or across an explicitly
   supplied set of Plugins when cross-Plugin collisions exist?
5. Does a future product need namespaced internal Skill selection while
   preserving the unmodified standard `SKILL.md` name? First Slice collision
   rejection avoids answering prematurely.
6. Where should an explicit human-owned local Plugin path be selected once a
   product UI is authorized? First Slice uses only a test/internal explicit
   path and adds no Settings surface.
7. Should a future installed Plugin remain user-scoped only, or may a Project
   reference an already user-admitted Plugin without causing code admission?
8. Which Plugin diagnostics deserve a trusted human UI, and which must remain
   content-free to avoid leaking local paths/package content?
9. Before executable Plugins, should Fielora pursue an OS-sandboxed process
   host or a WASM component host for the first real executable use case? The
   current direction is Process, but implementation remains blocked on a real
   sandbox and mediated host API.
10. Which declarative Surface points have a real user workflow? No empty
    Extensions/Skills/Plugins navigation should be created before that proof.
11. If package signing is introduced, what exact fact does it prove (package
    integrity, Publisher control, review status), and how is that kept separate
    from Tool permission and Semantic Authority?
12. How should Plugin source/trust facts eventually cross FIPC without exposing
    absolute local paths or turning Renderer state into admission authority?

---

# 23. EXPLICIT_NON_SCOPE

- no Plugin Runtime, process, Worker, WASM, or third-party code;
- no TypeScript, React, FIPC, UI, ToolProvider contribution, MCP contribution,
  Credential, Policy, new receipt hierarchy, Verification, database schema,
  migration, or dependency change;
- no Plugin directory watcher or Project Plugin auto-scan;
- no installer, package archive, Git fetch, registry, Marketplace, signing,
  update, Publisher economy, ratings, reviews, payments, or ranking;
- no Tool, MCP, Context Provider, Command, Surface, file handler, Artifact
  handler, or Settings contribution implementation;
- no Frozen/Baseline document change;
- no Model or public network request.

---

# 24. FIRST_SLICE_IMPLEMENTATION_EVIDENCE

```text
FIRST DECLARATIVE LOCAL UNPACKED PLUGIN SLICE: IMPLEMENTED / VALIDATED
EXECUTABLE PLUGIN HOST: NOT IMPLEMENTED
MODEL REQUESTS: 0
NETWORK REQUESTS: 0
DEPENDENCY DELTA: 0
SCHEMA / MIGRATION: 0
```

Implemented path:

```text
explicit Fielora/test-owned local root
  -> exact bounded fielora.json
  -> strict typed manifest/identity/version/engine validation
  -> canonical contribution containment
  -> bounded PluginSnapshot
  -> existing SkillCatalog
  -> existing list_skills / load_skill
  -> existing ContextCompiler
```

Repository evidence:

- `crates/fielora-agent/src/plugins.rs`: declarative manifest parser,
  fail-closed error taxonomy, identity/engine/path bounds, exact-byte manifest
  digest, contribution-aware snapshot digest, and manifest TOCTOU;
- `crates/fielora-agent/src/skills.rs`: additive `PLUGIN` source, explicit
  Plugin-root catalog assembly, atomic collision rejection, stable Plugin
  provenance, existing Skill digest/TOCTOU, and generalized Context warning;
- `crates/fielora-core/src/agent_runtime.rs`: dormant trusted composition entry
  for explicit roots; ordinary Project startup remains scan-free;
- `crates/fielora-agent/tests/fixtures/plugin-fixture/`: deterministic standard
  Agent Skill fixture with a lazy body sentinel;
- `docs/extensions/LOCAL_UNPACKED_PLUGIN_SKILL_V0.1.md`: minimal authoring note.

Validated boundaries:

- manifest valid/missing/malformed/unknown/oversized, required fields, bounded
  fields/counts, invalid/reserved/duplicate identity, core version, supported,
  unsupported and incompatible engine expressions;
- relative path admission, absolute/`..` rejection, missing exact `SKILL.md`,
  duplicate contribution, and Windows junction escape;
- metadata-only initial catalog, lazy body sentinel, bounded resource inventory,
  no automatic reference body admission, no script execution, advisory-only
  `allowed-tools`, and unchanged Policy decision;
- built-in/Project/Plugin Skill collision rejection and duplicate Plugin ID;
- manifest change -> `PLUGIN_CHANGED`; Skill change -> existing
  `AGENT_SKILL_CHANGED`; unrelated package file does not change snapshot;
- exact Tool catalog equality before/after admission, zero CredentialStore reads,
  zero MCP activation, no Verification PASS, no fixture mutation, and existing
  Skill-load receipt rather than a Plugin receipt hierarchy.

Targeted validation completed:

```text
cargo test -p fielora-agent --all-targets -- --test-threads=1
  PASS: 94 unit + 3 office probe tests

cargo test -p fielora-core --features mcp-fixture -- --test-threads=1
  PASS: 32 Core + 13 MCP transport tests

cargo clippy -p fielora-agent --all-targets -- -D warnings
  PASS

cargo clippy -p fielora-core --all-targets --features mcp-fixture -- -D warnings
  PASS

cargo fmt --all -- --check
pnpm contracts:check
pnpm contracts:verify-current
pnpm audit:context
pnpm verify:dev:docs
git diff --check
  PASS
```

JSON Schema remains deferred. The First Slice needed no package dependency and
the typed runtime parser plus deterministic tests remain the single source of
admission authority. This document remains `DRAFT / CANDIDATE / NOT FROZEN`.
