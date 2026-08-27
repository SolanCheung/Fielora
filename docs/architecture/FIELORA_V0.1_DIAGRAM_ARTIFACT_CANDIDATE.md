# Fielora V0.1 Diagram Artifact Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `FIRST SLICE IMPLEMENTED / TARGETED VALIDATED`

**Scope:** Factual alignment and bounded architecture record for the implemented
durable Diagram Artifact first slice using the existing Artifact, Tool, Policy,
receipt, export, and Verification paths.

This remains a non-Frozen architecture Candidate. The separately authorized
first slice adds typed Diagram contracts, bounded validation/canonicalization,
the repository-owned deterministic layout, controlled SVG export, and targeted
evidence. It does not modify Frozen/Baseline specifications, the Rapid Desktop
route, UI/FIPC, dependencies, or Storage migrations.

## Decision summary

```text
Diagram
  = a typed, renderer-neutral semantic graph
  = one ArtifactContentV1 variant
  != SVG, Mermaid, canvas state, or presentation geometry

Diagram create/update/read/export
  -> existing durable Artifact identity and immutable revisions
  -> existing Tool catalog / PolicyEngine / Approval / ToolExecutor
  -> existing durable ToolCall receipt
  -> existing exact-revision Verification boundary

SVG
  = one static rendered representation of an exact Diagram revision
  != the Diagram source of truth
```

The implemented shape is the backend-only vertical slice proposed here: typed
Diagram content, bounded graph validation, deterministic in-process layout,
and static SVG export through the existing saved `artifact.export` path. It
adds no Diagram runtime, Diagram agent, parallel store, permission engine,
receipt hierarchy, or verification engine.

The separate schema-9 storage repair resolved the Core extensibility blocker.
Migration 0008 remains immutable; forward migration 0009 replaces only its
closed persisted type list with a bounded canonical token. The production
domain and Model-facing durable Artifact schemas are now closed to
Document/Presentation/Diagram; arbitrary and future unknown types still fail
closed. Diagram was separately authorized and implemented without schema 10.

## CURRENT_DIAGRAM_REALITY

### Diagram-specific reality

| Item | Status | Current module / file | Existing semantic owner | Gap |
|---|---|---|---|---|
| Durable Artifact identity | `EXISTS` | `ArtifactId`, `ArtifactRevisionId`, Artifact/revision views in `crates/fielora-contracts/src/lib.rs` | Existing Artifact Core | Reusable unchanged for Diagram |
| Immutable Artifact revisions | `EXISTS` | `artifacts` and `artifact_revisions` from migration 0008, retained by schema 9 | Existing StorageWorker / Artifact repository | Reusable unchanged for Diagram |
| Artifact typed content | `EXISTS / THREE TYPES` | `ArtifactContentV1::{Document, Presentation, Diagram}` in `crates/fielora-contracts/src/lib.rs` | Artifact contract | Closed typed union; future unknown types still reject |
| Artifact type storage admission | `EXISTS / EXTENSIBLE` | `0009_artifact_type_extensibility.sql` | SQLite structural invariant | DB admits `DIAGRAM` through the existing bounded canonical token; schema remains 9 |
| Artifact create/read/update | `EXISTS / THREE TYPES` | Durable Artifact Tool execution in `crates/fielora-core/src/agent_runtime.rs` and `crates/fielora-agent/src/artifact.rs` | Existing Tool pipeline + Artifact Core | Diagram uses the same create/read/update path and full-replacement update semantics |
| Artifact export | `EXISTS / THREE FORMATS` | `artifact.export` in `crates/fielora-agent/src/artifact.rs` | Existing Artifact Tool adapter | Saved Diagram revisions dispatch to controlled SVG; inline Diagram export remains deferred |
| Diagram semantic model | `EXISTS` | Typed Diagram DTOs in `crates/fielora-contracts/src/lib.rs` | Artifact contract | Bounded closed nodes, edges, groups, layout, and presentation intent |
| Stable element identity | `EXISTS` | `DiagramNodeId`, `DiagramEdgeId`, `DiagramGroupId` | Diagram contract | Diagram-local, canonical, revision-stable; not SVG or global authority |
| Graph validation | `EXISTS` | `crates/fielora-agent/src/diagram.rs` | Diagram Artifact adapter | Fail-closed duplicates/references/groups/bounds; cycles/self/parallel/disconnected admitted |
| Diagram canonicalization | `EXISTS` | `diagram::canonicalize` through existing `artifact::canonicalize_content` | Existing Artifact digest boundary | Arrays and members sort by stable local ID; derived geometry excluded |
| Diagram layout engine | `EXISTS / BOUNDED` | `FIELORA_BOUNDED_LAYERED_V1` in `crates/fielora-agent/src/diagram.rs` | Artifact renderer adapter | Deterministic SCC/rank/component/group placement; quality deliberately bounded |
| Mermaid parser/renderer | `ABSENT` | No Mermaid dependency or admission path | None | Not required and not selected for the first slice |
| SVG renderer | `EXISTS / STATIC` | `fielora.diagram.svg@0.1.0` in `crates/fielora-agent/src/diagram.rs` | Artifact renderer adapter | Controlled vocabulary only; no input SVG/XML/CSS/URL |
| SVG export path | `EXISTS / SAVED REVISION` | Existing contained atomic/no-overwrite Project file export plus Diagram dispatch | Project filesystem + Artifact Tool | Final bytes are independently reparsed before success; no inline Diagram mode |
| Safe in-app SVG preview | `ABSENT` | Workspace image preview admits raster formats; SVG is treated as text or system-openable file | Desktop Workspace / Library | Browser rendering is not an Artifact preview contract; no UI is authorized |
| Diagram UI/editor | `ABSENT` | No Artifact Diagram surface or FIPC consumer | None | Explicitly deferred |
| Diagram Verification | `PARTIAL / REUSABLE` | Existing exact `ARTIFACT_REVISION` subject, semantic digest, and Verification Receipt | Existing Harness Verification | Identity boundary is sufficient; no Diagram-specific truth authority exists or is needed |
| Diagram receipts | `EXISTS / REUSED` | Existing durable ToolCall receipt with compact Diagram/render facts | Existing Harness ledger | No full semantic content/SVG and no new receipt hierarchy |
| Diagram composition | `ABSENT` | No typed Artifact-to-Artifact composition reference | None | Future Document/Presentation embedding needs a separate bounded reference contract |

### Architecture-smell audit

| Smell | Candidate ruling |
|---|---|
| New Diagram runtime or agent | Reject. Diagram is an Artifact type plus a renderer adapter. |
| New Diagram store or revision system | Reject. Reuse the existing Artifact aggregate and immutable revisions. |
| New Diagram Tool family | Reject for V1. Extend the existing typed `artifact.create`, `artifact.update`, `artifact.read`, and saved `artifact.export` surfaces. |
| Parallel permission or approval | Reject. All executable operations keep their current existing Tool effects. |
| Parallel receipt or verification | Reject. Reuse durable ToolCall receipts and exact Artifact-revision Verification subjects. |
| Persisted SVG/Mermaid as source | Reject. Persist typed semantic content; rendered files are derived representations. |
| Renderer coordinates in semantic content | Reject for the first slice. Layout geometry is renderer-owned and reproducible. |
| Diagram encoded as Presentation | Reject. It loses type truth, weakens validation, and creates an irreversible compatibility trap. |
| Ignore or disable the migration 0008 `CHECK` | Reject. This would bypass a storage invariant and misrepresent compatibility. |
| New Diagram-specific SQLite tables | Reject. Existing Artifact rows/revisions are the correct ownership model once type admission is migrated. |

## DIAGRAM_DEFINITION

```text
DiagramArtifactV1
  = a bounded general directed graph
  = stable local element identities
  + typed semantic relationships
  + small renderer-neutral presentation intent
  + deterministic layout intent
```

A Diagram is not:

- SVG, Mermaid, HTML, canvas commands, CSS, or arbitrary XML;
- a screenshot, image attachment, Project file, or Library object;
- a Presentation slide or a set of absolute rectangles;
- a free-form knowledge graph or a new Reality graph;
- an Agent, Skill, renderer process, Tool provider, or Verification authority.

Why Diagram belongs now: the implemented durable Artifact Core already owns
stable Artifact identity, immutable revisions, optimistic conflict handling,
typed content, saved export, receipts, recovery, and exact-revision
Verification subjects. Diagram is a credible next type because it exercises
graph semantics and a non-Office renderer without requiring a second lifecycle.
Storage admission is type-extensible; the implemented typed Domain/Tool/
renderer branch supplies Diagram semantics without changing Artifact lifecycle.

## ARTIFACT_CORE_REUSE

| Concern | Ruling | Delta |
|---|---|---|
| Artifact/Profile/optional Project ownership | `REUSE` | None |
| ArtifactId / ArtifactRevisionId | `REUSE` | None |
| Immutable revision and current-pointer CAS | `REUSE` | None |
| Mutation idempotency and restart recovery | `REUSE` | None |
| `artifact.create/read/update/export` execution pipeline | `EXTENDED / IMPLEMENTED` | Diagram is admitted in existing strict tagged schemas and saved renderer dispatch |
| Artifact semantic-content union | `EXTENDED / IMPLEMENTED` | One closed `Diagram` variant added; content schema version remains 1 |
| Persistence tables | `REUSE` | No new Diagram table |
| Persisted Artifact type constraint | `REUSE` | Schema 9 already admits bounded canonical future tokens; no Diagram-specific migration |
| Policy / Approval / ToolExecutor | `REUSE` | No Diagram permission |
| ToolCall receipt | `EXTEND MINIMALLY` | Record type, graph counts, renderer/version, viewBox, and output digest in existing receipt |
| Artifact revision Verification subject | `REUSE` | Exact ArtifactId + RevisionId + semantic digest remains authoritative |
| Workspace freshness | `REUSE` | Existing Artifact mutation fact path is type-neutral |
| Project file export | `REUSE` | Existing containment, sensitive-path denial, no-overwrite, atomic write, cleanup, and output digest |
| Diagram validator/layout/SVG adapter | `NEW / BOUNDED` | Pure in-process modules behind existing Artifact Tool execution |
| UI/FIPC | `NONE` | Not required for the backend proof |

The implementation preserves the canonical architecture:

```text
Model
  + Harness
      Context / orchestration
      Policy / Approval
      Tool execution ledger
      Verification
  + Tools
      existing Artifact operations
      Diagram validator / layout / SVG backend
```

## TYPE_MODEL

The implemented additive contract is:

```text
ArtifactType
  = DOCUMENT
  | PRESENTATION
  | DIAGRAM

ArtifactContentV1
  = Document(DocumentArtifact)
  | Presentation(PresentationArtifact)
  | Diagram(DiagramArtifactV1)

DiagramArtifactV1 {
  title?: BoundedText,
  description?: BoundedText,
  layout: DiagramLayoutIntentV1,
  nodes: DiagramNodeV1[],
  edges: DiagramEdgeV1[],
  groups: DiagramGroupV1[]
}
```

`content_schema_version` remains `1`. The version identifies
the closed V1 representation of each tagged Artifact content variant; adding a
new tagged variant does not alter the representation of existing Document or
Presentation V1 values. The database schema version is a distinct concern and
already advances independently to schema 9; adding the typed `DIAGRAM` variant
requires no Diagram-specific migration.

Unknown Artifact types, Diagram semantic kinds, layout strategies, directions,
and style intents fail closed. Raw JSON objects do not bypass the tagged typed
union.

## ELEMENT_IDENTITY

Every Diagram element has a stable local identity:

```text
DiagramNodeId
DiagramEdgeId
DiagramGroupId
```

Implemented lexical form: `^[a-z][a-z0-9_-]{0,63}$` after strict ASCII
validation. The identifiers are unique within one Diagram Artifact and remain
stable when an element survives across revisions.

They are not:

- labels, array positions, SVG DOM IDs, UUID requirements, global Resource
  identities, or new database primary keys;
- authorized to refer across Artifacts;
- automatically exposed as Project/Conversation/Reality identities.

The Model or another caller may propose local IDs, but Core validation owns
lexical admission, uniqueness, and reference integrity. Renderers may derive
sanitized internal SVG IDs, but those IDs have no semantic authority.

## SEMANTIC_MODEL

### Nodes

```text
DiagramNodeV1 {
  node_id: DiagramNodeId,
  label: BoundedText,
  description?: BoundedText,
  semantic_kind: DiagramNodeKind,
  presentation?: DiagramNodePresentationIntentV1
}

DiagramNodeKind
  = GENERIC | PERSON | SYSTEM | SERVICE | DATABASE | PROCESS | DOCUMENT
```

### Edges

```text
DiagramEdgeV1 {
  edge_id: DiagramEdgeId,
  source_node_id: DiagramNodeId,
  target_node_id: DiagramNodeId,
  label?: BoundedText,
  relation_kind: DiagramRelationKind,
  direction: DiagramEdgeDirection,
  presentation?: DiagramEdgePresentationIntentV1
}

DiagramRelationKind
  = RELATION | FLOW | DEPENDS_ON | CONTAINS

DiagramEdgeDirection
  = FORWARD | BIDIRECTIONAL | NONE
```

### Groups

```text
DiagramGroupV1 {
  group_id: DiagramGroupId,
  label: BoundedText,
  semantic_kind: DiagramGroupKind,
  member_node_ids: DiagramNodeId[]
}

DiagramGroupKind
  = BOUNDARY | LAYER | CLUSTER
```

These enum values are implemented Candidate vocabulary, not Frozen API. Every
value is closed and independent of a particular SVG shape.

## SEMANTIC_VS_VISUAL

Persist semantic truth and small visual intent; do not persist a renderer scene
graph.

| Persisted semantic content | Optional persisted intent | Renderer-owned output |
|---|---|---|
| Element IDs, labels, descriptions | Node shape family | x/y/width/height |
| Node semantic kind | Normal/emphasis plus closed shape intent | Font metrics and wrapping |
| Edge endpoints, relation kind, direction | Normal/emphasis edge intent | Paths, bends, arrowhead geometry |
| Group membership and semantic kind | Layout direction | Colors, stroke widths, padding |
| Explicit layout strategy | None beyond the closed V1 fields | SVG DOM organization and IDs |

Implemented presentation vocabulary:

```text
DiagramNodeShape = AUTO | RECTANGLE | ROUNDED_RECT | ELLIPSE
DiagramEmphasis = NORMAL | EMPHASIS
```

No raw color, CSS, font family, font file, arbitrary numeric coordinate, SVG
path, HTML label, image URL, or renderer-specific property is durable content.
The first export profile is a stable renderer-owned `LIGHT_NEUTRAL_V1` theme.
Changing a renderer theme does not mutate Diagram semantic content.

## LAYOUT_MODEL

The first-slice semantic layout contract is intentionally small:

```text
DiagramLayoutIntentV1 {
  strategy: LAYERED_AUTO,
  direction: LEFT_TO_RIGHT | TOP_TO_BOTTOM
}
```

No manual, pinned, mixed-auto, or user-supplied geometry is accepted. Array
order does not encode layout. Stable local IDs provide the deterministic
tie-break when the semantic graph otherwise leaves ordering open.

The V1 graph is not tree-only. It admits disconnected components, converging
and diverging edges, cross-edges, self-edges, and cycles. It does not promise
globally optimal edge crossing, free-form drawing, nested containers, ports,
swimlanes, UML completeness, or interactive editing fidelity.

## LAYOUT_ENGINE_DECISION

Select a repository-owned bounded algorithm named
`FIELORA_BOUNDED_LAYERED_V1` for the first proof. This is not a general Graphviz
replacement.

Candidate deterministic stages:

1. Validate and canonicalize the graph before layout.
2. Find weakly connected components with stable ID ordering.
3. Collapse strongly connected components for cycle-safe rank assignment.
4. Assign ranks in the requested direction on the condensation DAG.
5. Order rank members by deterministic graph facts and local ID tie-breaks.
6. Compute fixed-style node sizes from bounded labels using renderer-owned,
   deterministic text metrics.
7. Place one-level non-overlapping groups around admitted members.
8. Route forward edges with controlled orthogonal/polylines and reserve stable
   feedback lanes for self/cyclic/back edges.
9. Arrange disconnected components in deterministic rows/columns.
10. Reject with `DIAGRAM_LAYOUT_OVERFLOW` if configured viewBox, coordinate,
    text-fit, or execution bounds cannot be met.

Crossings are supported but not guaranteed to be minimized. Parallel edges use
deterministic lanes. Layout output is derived state and is not stored as the
Diagram source.

No new layout dependency is selected. If later quality requirements include
large graphs, compound/nested graphs, sophisticated crossing minimization, or
manual/automatic reconciliation, a separate dependency and security Change
Impact must compare mature candidates before implementation.

## MERMAID_DECISION

`MERMAID_AS_SEMANTIC_SOURCE: REJECTED`

`MERMAID_AS_FIRST_RENDERER: NOT SELECTED`

Mermaid text would introduce a separate parser/version vocabulary, ambiguous
element identity, raw instruction admission, renderer/runtime dependencies,
and diff semantics that do not match the existing typed Artifact contract.
Persisting it would make a presentation language authoritative over Fielora's
semantic graph.

A future optional Diagram-to-Mermaid export may be considered as another
derived representation. It must not become a bypass around Diagram validation,
Policy, receipts, or revision identity.

## SVG_DECISION

`STATIC_SVG_EXPORT: SELECTED CANDIDATE`

`SVG_AS_SEMANTIC_SOURCE: REJECTED`

`SAFE_IN_APP_SVG_PREVIEW: ABSENT / DEFERRED`

The renderer generates deterministic static SVG bytes from an exact Diagram
revision and the versioned renderer/theme profile. It accepts no caller-supplied
XML, CSS, scripts, URLs, templates, fonts, images, or raw attributes.

Initial generated element allowlist:

- `svg`, `g`, `rect`, `ellipse`, `line`, `polyline`, `polygon`, `text`, and
  `tspan`;
- exact SVG namespace, finite bounded numeric attributes, renderer-owned
  presentation attributes, and escaped text only.

Explicitly prohibited:

- `script`, `style`, `foreignObject`, `image`, `use`, animation elements,
  metadata payloads, DTD/entities, processing instructions, and unknown
  elements;
- `href`, `xlink:href`, event-handler attributes, external resource references,
  `data:`, `file:`, HTTP(S), raw CSS, embedded fonts, filters, and arbitrary XML.

The implemented renderer identity is:

```text
renderer_id = fielora.diagram.svg
renderer_version = 0.1.0
theme_profile = LIGHT_NEUTRAL_V1
```

These remain Candidate rather than Frozen values. PNG raster export is deferred.

## CANONICALIZATION

Diagram canonicalization extends the existing typed Artifact canonicalization
boundary; it does not introduce another digest authority.

Candidate rules:

- validate the complete typed graph before canonical serialization;
- sort nodes, edges, and groups by their stable local IDs;
- sort each group's member IDs;
- never interpret input array order as semantic or visual order;
- preserve admitted string content exactly after bounded validation; reject NUL
  and disallowed control characters;
- require non-empty labels after the contract's whitespace check;
- do not silently Unicode-normalize content unless a future contract explicitly
  adopts and versions that rule;
- serialize the tagged `Diagram` content and its explicit semantic/layout/
  presentation intent through the existing canonical JSON mechanism.

The semantic digest includes the canonical Diagram content. It excludes
ArtifactId, RevisionId, timestamps, ToolCall IDs, exported SVG bytes, output
path, renderer version, theme implementation, and derived geometry.

Two admitted graphs that differ only in array ordering must produce the same
canonical semantic bytes and digest. A layout-sensitive ordering requirement
must later be represented by an explicit typed field, never by incidental array
position.

## BOUNDS

Proposed V1 bounds, all enforced before layout and export:

| Dimension | Candidate bound |
|---|---:|
| Canonical Artifact content | Existing `256 KiB` maximum |
| Nodes | `1..64` |
| Edges | `0..128` |
| Groups | `0..16` |
| Group nesting depth | `1`; groups contain nodes only |
| Members per group | `1..64` |
| Node label | `1..120` Unicode scalar values and `<= 1 KiB` UTF-8 |
| Edge/group label | `1..120` Unicode scalar values and `<= 1 KiB` UTF-8 when present |
| Node description | `<= 1024` Unicode scalar values and `<= 4 KiB` UTF-8 |
| Total admitted Diagram text | `<= 64 KiB` UTF-8 |
| Rendered SVG | `<= 2 MiB` |
| Positive viewBox width/height | Each `<= 16,384` logical units |
| Render duration | Existing bounded Tool deadline; no new background runtime |
| External assets, fonts, URLs | `0` |

Bounds are additive and must fail closed before any final file mutation. The
existing wider Artifact read/export and Tool output limits still apply.

## GRAPH_VALIDATION

| Graph condition | V1 ruling |
|---|---|
| Duplicate node/edge/group ID | Reject |
| Edge endpoint missing | Reject |
| Self-edge | Allow; render as bounded loop/feedback route |
| Directed cycle | Allow; SCC-aware layout and feedback routing |
| Disconnected component | Allow; deterministic component placement |
| Empty graph | Reject |
| One node and no edge | Allow |
| Empty group | Reject |
| Missing group member | Reject |
| Duplicate member in one group | Reject |
| One node in multiple groups | Reject in V1 |
| Nested/recursive group | Not representable in V1; unknown/nested input rejects |
| Parallel edges with distinct IDs | Allow; deterministic lanes |
| Duplicate semantic edge | Admit only if IDs are distinct; diagnostics may flag redundancy but must not mutate content |
| Ungrouped/orphan node | Allow |
| Non-finite or caller-supplied geometry | Reject because geometry is not in the V1 contract |

Validation errors are stable bounded Tool errors. Diagnostics must not include
full Diagram content or unrelated data.

## SECURITY_MODEL

The trust boundary remains unchanged:

```text
Model/user/untrusted source Diagram content
  -> strict typed schema
  -> aggregate and graph bounds
  -> canonical validation
  -> deterministic in-process layout
  -> controlled SVG writer
  -> independent structural SVG admission
  -> contained atomic Project file create
```

Diagram content remains `UNTRUSTED_ARTIFACT_CONTENT` when admitted to Context.
Labels and descriptions are data, not HTML/XML/Markdown instructions. Loading
or rendering a Diagram cannot execute shell commands, scripts, network calls,
package installation, MCP activation, file reads, or subagents.

The structural SVG check must parse generated bytes independently of the
layout data structure and prove:

- exact root/namespace and element/attribute allowlists;
- zero DTD, entity, script, event, external reference, image, style, and
  foreign-object constructs;
- finite coordinates, positive bounded viewBox, and no NaN/infinity;
- expected bounded node/edge/group representation counts;
- escaped admitted semantic text is present without treating it as markup;
- output size and SHA-256 are recorded before the atomic final write.

Existing Project containment, canonical-path checks, sensitive-path denial,
no-overwrite, same-directory atomic write, cancellation cleanup, Tool policy,
Approval, and receipt rules remain mandatory. SVG generation cannot grant
permission or Verification authority.

## RENDERER_BOUNDARY

The Diagram renderer is an existing Tool backend concern, not a Capability
Runtime:

```text
ArtifactContentV1::Diagram
  -> validate/canonicalize
  -> FIELORA_BOUNDED_LAYERED_V1
  -> fielora.diagram.svg renderer
  -> structural/static SVG validator
  -> existing contained Artifact export writer
```

The renderer receives one exact immutable Artifact revision. It does not query
Conversations, Context, Web, MCP, Library, credentials, or the Model. It owns
geometry and renderer theme, not semantic authority. It must be deterministic
for the same canonical content, renderer version, and export profile, subject
to an explicitly tested byte-determinism contract.

The existing `quick-xml` direct dependency may be evaluated for controlled XML
writing/parsing during implementation review. Its presence does not by itself
authorize a renderer change. Transitive TypeScript XML packages are not a
Fielora production SVG abstraction and must not be promoted merely because
they are already in the lockfile.

## EXPORT_MODEL

First-slice Diagram export extends only the saved-revision mode of existing
`artifact.export`:

```text
artifact.export {
  artifact_id,
  revision_id,
  output_path: project-relative *.svg
}
```

The operation pins and re-reads the exact revision, checks its semantic digest,
dispatches `DIAGRAM -> SVG`, renders to bounded memory, structurally validates
the bytes, and uses the existing atomic/no-overwrite contained Project file
write. Inline request-scoped Diagram export is deferred so the first proof
cannot bypass durable identity and revision semantics.

The existing receipt may add compact fields:

- `artifact_type=DIAGRAM`, ArtifactId, RevisionId, semantic digest;
- node/edge/group counts;
- layout and renderer IDs/versions plus theme profile;
- viewBox dimensions, static-security/structural-check outcome;
- contained output path, byte count, and SHA-256.

It must not duplicate full Diagram content or SVG bytes. Exported SVG is a
derived Project file, not a new Artifact revision, Library object, trusted
attachment, or Verification PASS.

## VERIFICATION_BOUNDARY

The existing `ARTIFACT_REVISION` subject is sufficient:

```text
Verification subject
  = exact ArtifactId
  + exact ArtifactRevisionId
  + exact semantic content digest
```

No Diagram-specific Verification engine or receipt type is proposed.

Layout completion, static SVG validation, file creation, output digest, and
semantic label-presence checks are Tool execution evidence only. They do not
prove that:

- the graph is factually correct;
- an architectural relationship is true;
- the Diagram satisfies a user requirement;
- the visual hierarchy is effective or accessible;
- a newer Artifact revision remains verified.

Any real correctness/quality verification must be an explicit existing Harness
Verification action against the exact current revision. Updating the Diagram
continues to make older evidence stale through the existing freshness model.

## COMPOSITION_FUTURE

Future Document or Presentation composition should reference, not inline, a
Diagram Artifact:

```text
ArtifactRef {
  artifact_id,
  revision_policy: PINNED(revision_id) | explicit future policy
}
```

A composed export must record both the referenced semantic revision/digest and
the renderer snapshot provenance. It must not persist base64 SVG, copied raw
XML, or a mutable “latest” reference without an explicit freshness policy.

Composition, asset lifecycle, automatic refresh, and reference garbage
collection are separate Change Impacts and are not part of the first Diagram
slice.

## UI_BOUNDARY

No UI is needed to prove the backend slice. Specifically deferred:

- Diagram canvas/editor, inspector, toolbar, templates, drag/drop, connectors,
  zoom/pan, collaboration, and version history UI;
- Artifact list/detail/revision surfaces and FIPC additions;
- in-app SVG preview, SVG sanitizing DOM host, and raster fallback;
- import from Mermaid/SVG/Graphviz, Clipboard, or external design tools.

Current Workspace preview does not supply a safe Artifact SVG preview
primitive. The Browser can display isolated web/local content, but that does
not make Browser runtime an Artifact renderer or preview authority. The first
slice may be validated by saved bytes, structural parsing, deterministic test
fixtures, and an explicitly scoped human-open review without product UI.

## DEPENDENCY_IMPACT

`FIRST_SLICE_NEW_DEPENDENCY: NONE`

Repository reality contains no current Graphviz, Dagre, ELK, Mermaid,
Cytoscape, React Flow, D3 graph-layout, `usvg`, or `resvg` production
dependency. The candidate intentionally uses a bounded internal layout proof
and static SVG generation so dependency choice does not dominate the semantic
validation.

Existing direct `quick-xml 0.41` is reused only to independently parse final SVG
bytes and enforce root/namespace, vocabulary, attribute, count, text-presence,
DTD/entity/PI, size, and viewBox rules. No dependency was added.

If the bounded algorithm cannot meet the accepted fixture quality/bounds, stop
and return to architecture review. Do not silently grow it into a general
diagramming engine or install a library without a separate dependency,
license, activity, security, binary-size, determinism, and Windows deployment
assessment.

## SCHEMA_MIGRATION_IMPACT

The previously identified Core extensibility blocker is repaired in schema 9.

```sql
artifact_type TEXT NOT NULL
  CHECK (
    length(CAST(artifact_type AS BLOB)) BETWEEN 1 AND 32 AND
    artifact_type GLOB '[A-Z]*' AND
    artifact_type NOT GLOB '*[^A-Z0-9_]*'
  )
```

Forward migration `0009_artifact_type_extensibility` rebuilds only the Artifact
envelope table and preserves migration 0008, all existing Document/Presentation
rows, immutable revisions, current pointers, provenance, indexes, foreign keys,
Verification subjects, and Profile schema version 1. Therefore:

```text
DIAGRAM-SPECIFIC DB SCHEMA CHANGE REQUIRED: NO
NEW_DIAGRAM_MIGRATION: 0
MODIFY_MIGRATION_0008: FORBIDDEN
NEW_DIAGRAM_TABLES: NO
PROFILE_SCHEMA_CHANGE: NO
```

Storage extensibility does not grant semantic authority. The current Rust
`ArtifactType`, `ArtifactContentV1`, Tool schemas, canonicalization, and content
schema version are closed to Document/Presentation/Diagram. A structurally
valid but unknown persisted token fails closed as `ARTIFACT_TYPE_UNSUPPORTED`;
there is no `UnknownArtifact(JSON)` fallback. The typed
`DIAGRAM + DiagramArtifactV1` pair required no type-specific database migration.
Encoding Diagram as `PRESENTATION`, using raw untyped JSON, or disabling checks
remains prohibited.

## SECURITY_BLOCKERS

| Blocker / risk | Classification | Candidate disposition |
|---|---|---|
| Storage admission for `DIAGRAM` | `PASS / SCHEMA 9` | Bounded canonical token storage plus closed typed Domain support |
| No safe in-app SVG preview | `NON-BLOCKING FOR BACKEND SLICE` | Export only; no UI or Browser reuse claim |
| SVG active-content/external-reference risk | `TARGETED GATE PASS` | Controlled generator plus independent allowlist parser; no raw SVG input |
| Layout resource exhaustion | `TARGETED GATE PASS` | Strict graph/text/output/viewBox bounds and deterministic overflow |
| Graph instruction injection | `TARGETED GATE PASS` | Text remains untrusted escaped data; load/render has no execution side effects |
| Renderer common-mode validation | `TARGETED GATE PASS` | Final saved bytes are independently reparsed with adversarial fixtures |

No security fact justifies a second runtime, sandbox process, credential path,
network capability, or new permission class for this bounded static renderer.

## CHANGE_IMPACT

| Area | Candidate impact | Reason |
|---|---|---|
| Frozen/Baseline architecture | `NONE` | No Frozen/Baseline document changed |
| Artifact semantic contract | `MEDIUM-HIGH` | Adds a closed typed graph variant and local identity vocabulary |
| Database schema/migration | `NONE FOR DIAGRAM` | Schema 9 already admits bounded future type tokens |
| Artifact repository/revisions | `LOW` | Existing generic rows and revision semantics are reusable |
| Tool schemas/dispatch | `MEDIUM` | Existing operations gain one strict type/format branch |
| Policy/Approval/ToolExecutor | `NONE` | Existing effects and pipeline remain authoritative |
| Receipts/Verification | `LOW` | Compact metadata delta only; exact revision subject reused |
| Layout engine | `MEDIUM-HIGH` | New deterministic graph algorithm with explicit quality limits |
| SVG renderer/security | `HIGH` | New file format and active-content exclusion boundary |
| Dependency graph | `NONE` | Existing direct quick-xml reused; no package addition |
| UI/FIPC | `NONE` | Explicitly deferred |
| Product route | `NONE` | Subordinate Artifact architecture track; no new phase |

Overall Diagram implementation Change Impact remains `HIGH` because typed graph
semantics, deterministic layout, and SVG export create a new security-sensitive
representation. It no longer includes a Diagram-specific schema migration.
The separately authorized implementation and targeted Core/Storage/security
evidence are complete. The canonical `Model + Harness + Tools` architecture is
unchanged.

## FIRST_SLICE_IMPLEMENTATION

| Option | Verdict |
|---|---|
| A. Semantic Diagram type only, no export | Too weak: proves persistence but not a useful representation |
| B. Request-scoped Diagram-to-SVG only | Reject: bypasses the durable Artifact goal and does not prove revision identity |
| C. Durable Diagram CRUD plus deterministic saved SVG export | **Implemented and targeted validated** |
| D. Diagram UI/editor plus runtime | Reject: far beyond the foundation proof |
| E. Mermaid/SVG import and round-trip | Reject: parser/security/fidelity scope dominates the first proof |

Implemented first slice:

```text
FIRST_DIAGRAM_ARTIFACT_SLICE

1. ArtifactType / ArtifactContentV1 gains DiagramArtifactV1
2. existing schema-9 bounded type storage accepts DIAGRAM
3. existing artifact.create/read/update handles bounded Diagram content
4. existing saved artifact.export maps exact Diagram revision to static SVG
5. FIELORA_BOUNDED_LAYERED_V1 supplies deterministic derived geometry
6. controlled SVG writer + independent static structural validator
7. existing Policy / Approval / ToolExecutor / ToolCall receipt
8. existing exact-revision Verification and freshness boundary

UI = 0
FIPC = 0
Network = 0
Credential = 0
Model request required by tests = 0
New Agent/runtime = 0
New Diagram tables = 0
New dependency = 0
Diagram inline export = NOT SUPPORTED
```

The slice does not activate UI, PNG, Mermaid, composition, Spreadsheet, a new
runtime, or a new migration.

## TARGETED_VALIDATION

### Contract and canonicalization

- accept minimal one-node and representative bounded graph fixtures;
- reject unknown fields/enums, malformed local IDs, empty/oversized labels,
  aggregate overflow, and total canonical content above 256 KiB;
- prove reordered nodes/edges/groups/members produce identical canonical bytes
  and semantic digest;
- prove semantic/layout/presentation changes alter the digest while derived
  geometry, output path, renderer version, and SVG bytes do not enter it;
- prove Document/Presentation serialized fixtures and digests remain unchanged.

### Storage and migration

- reuse the existing schema-8 to schema-9 preservation/rollback evidence;
- prove `DIAGRAM` passes the schema-9 bounded canonical token constraint without
  any new migration;
- prove the Diagram build admits only its typed content while any other bounded
  future token still returns `ARTIFACT_TYPE_UNSUPPORTED`;
- prove Diagram create/update conflict, idempotent replay, immutable revisions,
  historical read, recovery, and profile/project scoping reuse existing rules;
- prove no Diagram table, generic JSON fallback, or content-schema bump appears.

### Graph validation and layout

- duplicates, missing endpoints/members, empty graph/group, multiple group
  membership, and bound failures reject deterministically;
- self-edge, cycles, disconnected components, cross-edges, parallel edges, and
  ungrouped nodes follow the declared rulings;
- layout is deterministic under input reordering and repeated execution;
- node/group boxes do not overlap where the V1 contract forbids overlap;
- labels fit admitted nodes or fail `DIAGRAM_LAYOUT_OVERFLOW`;
- coordinates/viewBox are finite, positive, and bounded;
- adversarial dense and long-text fixtures complete within the existing Tool
  deadline or fail closed.

### SVG and file security

- every generated SVG passes exact root/namespace and element/attribute
  allowlists;
- injected XML/HTML/script/event/URL-looking text remains escaped text;
- assert zero DTD, entity, script, style, `foreignObject`, image, link, event,
  external resource, animation, NaN, infinity, and unknown element/attribute;
- exact node/edge/group counts, semantic label presence, output size, and digest;
- traversal, symlink/junction, sensitive path, existing output, cancellation,
  and failed validation leave no final/temporary file;
- output extension/type mismatch rejects.

### Existing pipeline and regression

- `artifact.create/update/export` retain their existing Tool effects and pass
  through PolicyEngine/Approval/ToolExecutor;
- denial produces no Artifact mutation or Project file;
- receipt contains bounded Diagram provenance and zero full content/SVG body;
- export success creates no Verification PASS;
- old evidence does not verify a new Diagram revision;
- existing Document/Presentation Artifact, Storage migration, recovery,
  contracts, Agent/Core integration, docs, and `git diff --check` stay green.

Implementation validation runs the affected Agent renderer/Artifact suite,
Diagram Core inheritance test, schema-9 Storage suite, contract generation and
current check, existing Core/Cross development lanes, affected Clippy with
`-D warnings`, release Core build, docs context audit, fmt, and diff checks.
Full premerge, Browser/Desktop visual E2E, packaged, and portable smoke remain
explicitly not run.

### Recorded implementation evidence

| Gate | Result |
|---|---|
| Diagram renderer tests | `PASS` — 7/7 |
| Agent library and Office writer regression | `PASS` — 103/103 + 3/3 |
| Core durable Artifact inheritance | `PASS` — Diagram create/read/update/export, R1/R2 historical export, conflict, idempotent replay, commit-before-receipt recovery, restart durability, revision-bound verification, and freshness are covered in the existing Core test |
| Storage schema-9 regression | `PASS` — 22/22; typed `DIAGRAM` round-trips and an unknown bounded future token still fails closed |
| Core development lane | `PASS` — fmt, Rust suites, and Clippy |
| Cross development lane | `PASS` — context audit, generated contracts, TypeScript typecheck/lint, 176/176 Desktop unit tests, Rust suites, Clippy, and 12/12 Core integration tests |
| Generated contract current check | `PASS` |
| Core release build | `PASS` |
| Migration and dependency diff | `PASS` — schema remains 9; zero migration or dependency-file changes |
| Diff hygiene | `PASS` — `git diff --check` |

The existing `ts-rs` generator emits its known informational warning that it
does not interpret Serde's `deny_unknown_fields` attribute. Rust/Serde runtime
deserialization still owns and enforces that fail-closed rule; generated
TypeScript contracts match the Rust source.

## OPEN_QUESTIONS

1. **Resolved by schema 9:** SQLite stores a bounded canonical token while
   Rust's closed `ArtifactType`/`ArtifactContentV1` union remains semantic
   authority; unknown tokens fail `ARTIFACT_TYPE_UNSUPPORTED`.
2. Are the proposed V1 semantic enum values minimal and stable enough, or
   should `CONTAINS` remain solely group membership rather than an edge kind?
3. One-level exclusive groups are implemented. Nested groups and more complex
   cluster behavior require a future semantic/layout review.
4. First-slice SVG bytes are byte-identical for the same canonical revision,
   renderer version, and theme. Any future renderer/profile choice needs an
   explicit provenance contract.
5. V1 exports exact `<title>`/`<desc>` plus `role=img` and a visible title.
   Richer accessibility reading-order work remains open.
6. `LIGHT_NEUTRAL_V1` is the only implemented profile. User-selectable themes
   and raw color remain out of scope.
7. The bounded layout passes the representative architecture, cycle,
   self/parallel/cross-edge, disconnected, group, CJK, and overflow fixtures.
   Larger or higher-fidelity layouts still require dependency review.
8. When composition is authorized, should references always pin a revision, or
   may an explicit current-with-freshness policy exist?
9. Safe in-app SVG preview and Diagram editing remain separate UI/security
   slices; neither is required to establish the backend Artifact type.

## NEXT_DECISION

`A. READY_FOR_SPREADSHEET_ARTIFACT`

The Diagram first slice is implemented and targeted validated on schema 9.
This Candidate remains `DRAFT / CANDIDATE / NOT FROZEN`; the decision does not
authorize Spreadsheet implementation.
