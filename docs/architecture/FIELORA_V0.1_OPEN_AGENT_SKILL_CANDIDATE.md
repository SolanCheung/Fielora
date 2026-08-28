# Fielora V0.1 Open Agent Skill Runtime Slice Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Authorization:** `PROJECT AGENT SKILL DISCOVERY + LAZY LOAD AUTHORIZED`

**Implementation:** `IMPLEMENTED / TARGETED VALIDATION PASS`

**Settings Metadata Exposure:** `IMPLEMENTED / TARGETED VALIDATION PASS`

**Change Impact:** `MEDIUM`

## User flow

```text
<project>/.agents/skills/<name>/SKILL.md
  -> bounded project discovery
  -> Run-scoped Skill catalog snapshot
  -> existing list_skills
  -> existing load_skill
  -> existing ContextCompiler admission
  -> existing Agent model context
```

The original runtime Slice extends `Harness.Ingress & Context` and
`Harness.Orchestration`. It does not create a Skill Runtime, Agent Runtime,
permission system, Tool path, receipt hierarchy, registry, or installer. A
later product-exposure changeset adds a metadata-only Settings page over this
same catalog; it does not reimplement discovery or load Skill bodies.

## Fixed scope

- The only external root is `<project>/.agents/skills/`.
- The only required content file is exact-case `SKILL.md`.
- Built-in Skills remain compiled and use the same catalog projection.
- Tier 1 exposes bounded name/description/source/trust metadata.
- Tier 2 loads one selected `SKILL.md` body through `ContextCompiler`.
- Tier 3 lists bounded relative resource paths only; it reads or executes no
  resource content.
- Project Skill content is `PROJECT / UNTRUSTED` and has no permission,
  Approval, Tool exposure, delegation, execution, or Semantic Authority.
- The original runtime Slice added no schema, migration, persistent global
  Skill registry, user Skill root, compatibility path, network, credential,
  process, Marketplace, Plugin, or UI change. Current Settings exposure remains
  read-only and uses the existing Built-in/Project/Plugin catalog projection.

## Safety bounds

```text
max skills/project        64
max SKILL.md              256 KiB
max frontmatter           32 KiB
max description           1024 characters
max compatibility         500 characters
max metadata entries      32
max metadata value        4 KiB
max listed resources      128 / skill
max relative path         512 characters
```

Project Skill paths and resources are canonicalized and must remain inside the
canonical project Skill root. Name/folder mismatch, malformed or oversized
frontmatter, path escape, digest drift, and collisions fail closed. A Project
Skill cannot shadow a built-in Skill.

## Dependency candidate

`yaml_serde = 0.10.7` is maintained by the YAML organization, licensed
`MIT OR Apache-2.0`, and declares Rust 1.82. The implementation exact-pins it,
disables default features, and enables only `std`. Its only purpose here is
bounded typed deserialization of standards-compatible YAML frontmatter;
unknown fields are ignored and gain no execution semantics.

Final dependency facts:

```text
direct dependency   yaml_serde 0.10.7 (exact pin)
license             MIT OR Apache-2.0
declared MSRV       Rust 1.82
enabled features    std only; default features disabled
dependency subtree  serde, indexmap, itoa, libyaml-rs 0.3.0, ryu 1.0.23
RustSec advisory DB a7bfe16948bf6f3ee25bdee4822209f87da21b80
advisory result     no package match for yaml_serde, libyaml-rs, or ryu
```

`yaml_serde` is the maintained YAML organization fork used only for bounded,
typed frontmatter deserialization. Existing workspace versions satisfy
`serde`, `indexmap`, and `itoa`; the lockfile adds only `yaml_serde`,
`libyaml-rs`, and `ryu` package records.

## Required evidence

- standard parsing, exact filename, validation and bounded discovery;
- metadata-only catalog and lazy body admission;
- Run-scoped catalog digest and discovery/load TOCTOU rejection;
- project/bundle/resource canonical containment including Windows junction;
- deterministic built-in/project collision behavior;
- `allowed-tools`, compatibility and metadata remain advisory;
- Skill loading executes no scripts and changes no Policy decision;
- built-in `list_skills` / `load_skill` regression;
- Core fixture through the existing Agent/ToolCall/receipt/context path;
- targeted tests, Clippy, rustfmt, Contracts, Docs lane and diff check.

## Implementation evidence

- `cargo test -p fielora-agent -- --test-threads=1`: 30 PASS;
- `cargo test -p fielora-core --features mcp-fixture -- --test-threads=1`:
  23 Core PASS plus 12 MCP transport PASS;
- targeted Clippy for `fielora-agent` and `fielora-core` with all targets and
  `-D warnings`: PASS;
- `cargo fmt --all -- --check`, `pnpm contracts:check`,
  `pnpm verify:dev:docs`, and `git diff --check`: PASS;
- Core fixture proves Tier-1 metadata has no body sentinel, Tier-2 appears
  only after existing `load_skill`, the Run context snapshot records the
  bounded catalog digest, both ToolCalls retain OBSERVE/ALLOW governance, no
  Verification receipt is invented, and the bundled script is not executed.

All `FORMAT`, `DISCOVERY`, `PROGRESSIVE_DISCLOSURE`, `CONTEXT`, `INTEGRITY`,
`CONTAINMENT`, `PERMISSION`, `EXECUTION`, `COLLISION`, and `REGRESSION` gates
are PASS. No full premerge, Desktop E2E, packaged smoke, or portable smoke was
run or required for this Candidate.

## Current Settings exposure

Settings → Skills now queries a typed metadata-only read model from the same
`SkillCatalog` used by Agent runs. It groups Built-in, current Project, and
Plugin-contributed Skills and exposes bounded name/description/source/scope/
trust/digest, supported frontmatter metadata, advisory `allowed-tools`, resource
path inventory, and Plugin provenance. The view does not call `load_skill`,
does not include the `SKILL.md` body, does not read resource bodies, and cannot
grant Tool exposure, permission, Approval, credential, MCP, process, delegation,
or Semantic Authority. A deterministic Desktop E2E proves Project and Plugin
body sentinels remain absent before and after expanding details, while Model
requests, public network requests, credential reads, MCP activation, process
starts, and new Agent runs remain zero. This document remains
`DRAFT / CANDIDATE / NOT FROZEN`.
