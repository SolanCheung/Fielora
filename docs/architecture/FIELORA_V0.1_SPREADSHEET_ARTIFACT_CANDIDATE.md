# Fielora V0.1 Spreadsheet Artifact Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `FIRST SLICE IMPLEMENTED / TARGETED VALIDATED`

**Scope:** Current-reality alignment, the implemented bounded first slice, and
remaining candidate boundaries for a durable Spreadsheet Artifact on the
existing Artifact Core. This remains a Candidate rather than a Frozen/Baseline
specification. The implemented slice adds no UI, migration, dependency, formula
engine, or new Runtime.

## Decision summary

```text
Spreadsheet Artifact
  = a Fielora-owned durable structured workbook model
  = one future ArtifactContentV1 variant
  != XLSX bytes, CSV text, HTML table, Excel process state, or arbitrary script

Spreadsheet semantic model
  -> literal-only calculation authority (`NONE`)
  -> renderer adapter
  -> XLSX representation
  -> future lossy CSV representation

Spreadsheet create/read/update/export
  -> existing durable Artifact identity and immutable revisions
  -> existing Tool catalog / PolicyEngine / Approval / ToolExecutor
  -> existing durable ToolCall receipt
  -> existing exact-revision Verification boundary
```

The repository now contains the implemented literal-only first slice: a typed
Spreadsheet Artifact contract, bounded validator/canonicalizer, saved-revision
XLSX renderer, independent final-byte package/semantic reopen, and integration
through the existing Artifact Tools, Policy/Approval, Storage, receipts,
recovery, and exact-revision Verification boundary. It reuses the exact-pinned
`office_oxide 0.1.8` writer after a repository-owned writer qualification.

Formula and calculation remain absent and fail closed. Formula-like values are
admitted only through the explicit `STRING` literal variant and reopen as exact
text. Formula support still requires a separate Change Impact because the
current writer serializes formula source without a cached result or declared
recalculation behavior. Excel or another Office process is not calculation or
semantic authority.

## CURRENT_SPREADSHEET_REALITY

### Durable Artifact Core

| Item | Status | Current module / file | Existing semantic owner | Gap |
|---|---|---|---|---|
| `ArtifactType` | `EXISTS / FOUR TYPES` | `crates/fielora-contracts/src/lib.rs` | Artifact contract | Includes additive `SPREADSHEET`; existing serialized tokens are unchanged |
| `ArtifactContentV1` | `EXISTS / FOUR VARIANTS` | `crates/fielora-contracts/src/lib.rs` | Artifact contract | Includes typed `SpreadsheetArtifactV1`; no arbitrary JSON fallback |
| Generated TypeScript Artifact contracts | `EXISTS / CURRENT` | `packages/contracts/generated/index.ts` | Rust contracts + `ts-rs` generation | Spreadsheet DTOs and union variant are generated; Serde `deny_unknown_fields` remains a Rust runtime rule not represented by `ts-rs` |
| Durable create/read/update | `EXISTS / SPREADSHEET ENABLED` | `crates/fielora-core/src/agent_runtime.rs`, `crates/fielora-agent/src/artifact.rs` | Existing Artifact Core through the Tool pipeline | Spreadsheet uses one additive typed canonicalization branch; no type-specific lifecycle |
| Saved exact-revision export | `EXISTS / SPREADSHEET XLSX ENABLED` | `artifact.export` in `crates/fielora-agent/src/artifact.rs`, `crates/fielora-agent/src/spreadsheet.rs` | Existing Artifact Tool adapter | Exact saved Spreadsheet revisions export through the `.xlsx` branch; inline Spreadsheet export remains absent by design |
| Inline export | `PARTIAL` | `crates/fielora-agent/src/artifact.rs` | Existing request-scoped Artifact export | Inline export remains Document/Presentation-only and is not needed for the Spreadsheet first slice |
| Revision and conflict | `EXISTS / REUSABLE` | Artifact repository in `crates/fielora-storage/src/lib.rs` | Existing immutable Artifact revision aggregate | Reuse exact `expected_revision_id`; do not create cell- or sheet-specific revision storage |
| Canonicalization and semantic digest | `EXISTS / SPREADSHEET ENABLED` | `artifact::canonicalize_content`; Spreadsheet delegates to `spreadsheet::canonicalize` | Existing Artifact digest boundary | Sheets sort by stable ID, cells by coordinate, decimals normalize, then use the same canonical JSON/SHA-256 boundary |
| Tool-call idempotency | `EXISTS / REUSABLE` | Core mutation request digest plus Storage unique constraints | Existing Tool/Artifact Core | Reuse canonical Spreadsheet semantic digest; no Spreadsheet idempotency layer |
| Commit-before-receipt recovery | `EXISTS / REUSED AND TESTED` | Artifact recovery in Core/Storage | Existing Artifact Core | Spreadsheet commit-before-receipt recovery and idempotent replay use the unchanged mechanism |
| Verification subject | `EXISTS / REUSABLE` | `ARTIFACT_REVISION` subject in Artifact/Verification contracts and schema 8 | Existing Harness Verification | Formula calculation or XLSX reopen must not create a second subject type |
| Verification freshness | `EXISTS / REUSABLE` | Exact revision ID + semantic SHA binding | Existing Harness Verification | An older verified revision must remain stale after Spreadsheet update |
| Content authority | `EXISTS / REUSABLE` | `artifact.read` returns `UNTRUSTED_ARTIFACT_CONTENT` | Existing Harness/Tool observation boundary | Spreadsheet cells and formulas remain untrusted content, not facts |
| Diagram additive type precedent | `EXISTS` | typed Diagram DTOs, validator/canonicalizer, SVG adapter | Artifact contract + Artifact renderer adapter | Confirms a new Artifact type can be additive without a second lifecycle or store |

### XLSX read/extract and dependency reality

| Item | Status | Current module / file | Existing semantic owner | Gap |
|---|---|---|---|---|
| `file.extract` XLSX admission | `EXISTS` | `crates/fielora-agent/src/file.rs` | File Intelligence Tool adapter | Read/extract only; it does not create or import an Artifact |
| XLSX source bounds | `EXISTS` | `MAX_XLSX_*` and OOXML admission in `file.rs` | File Intelligence security boundary | 64 sheets, 2,000 rows/sheet, 256 columns/sheet, 100,000 cells total plus archive/XML/output/time bounds |
| `office_oxide` XLSX read | `EXISTS` | `XlsxDocument::from_reader` through exact `office_oxide = 0.1.8` | Third-party parser behind File Intelligence | Parser availability is not a Fielora workbook semantic contract |
| Workbook/sheet/cell representation | `PARTIAL / DEPENDENCY ONLY` | `XlsxDocument`, parsed worksheets/rows/cells, `CellValue` | `office_oxide` | No Fielora-owned stable sheet identity, literal type, formula type, format intent, or bounds contract |
| Formula extraction | `EXISTS / READ ONLY` | `extract_xlsx` emits parsed cell value and `formula = ...` when present | File Intelligence observation | Formula source and cached value are untrusted observations; no parsing into a safe AST and no execution |
| Formula execution | `ABSENT` | Capability inspection explicitly reports no formula evaluation | None | No deterministic calculator, dependency graph, cycle policy, coercion rules, or calculation provenance |
| Formula network/process isolation | `EXISTS / READ PATH` | XLSX fixture includes `WEBSERVICE(...)` and is only extracted as text | File Intelligence Tool boundary | This proves non-execution during extraction, not safe Spreadsheet authoring |
| Merged-cell parsing | `PARTIAL / DEPENDENCY ONLY` | parsed `Worksheet.merged_cells` | `office_oxide` | Production `extract_xlsx` does not emit merges; no Artifact merge semantics |
| Merged-cell writing | `PARTIAL / DEPENDENCY ONLY` | `XlsxWriter::merge_cells` | `office_oxide` writer | No Fielora validation for overlap, ownership, canonical ordering, or structural reopen |
| Date system and formatted values | `PARTIAL / DEPENDENCY ONLY` | parser exposes `date1904`, styles, number formats, and formatting helpers | `office_oxide` | Production `extract_xlsx` uses its own raw `CellValue` text path and does not apply style-aware formatting or expose format metadata |
| Number formats | `PARTIAL / DEPENDENCY ONLY` | writer has a closed built-in `NumberFormat` set and cell styles | `office_oxide` writer | No Fielora format-intent contract or proven semantic roundtrip |
| Chart reading | `PARTIAL / DEPENDENCY ONLY` | `XlsxDocument.chart_text` extracts bounded chart text | `office_oxide` | Production extraction does not surface it; chart structure/series/visuals are not preserved |
| Chart writing | `ABSENT FOR PRODUCT` | No Fielora renderer and no chart writer use in the repository | None | Exclude charts from the first slice |
| External relationships | `EXISTS / SAFE READ POLICY` | OOXML admission warns `EXTERNAL_RELATIONSHIPS_IGNORED`; parser does not follow them | File Intelligence security boundary | Authored Spreadsheet export must prove it emits zero external relationships |
| Macro rejection | `EXISTS / READ PATH` | `.xlsm`/`.xltm`, `vbaProject`, encryption, malformed OOXML and unsafe archive paths reject | File Intelligence security boundary | Export must also prove zero macro/encryption parts; there is no macro-capable Artifact model |
| XLSX write API | `EXISTS / QUALIFIED LITERAL SUBSET` | `office_oxide::xlsx::write::XlsxWriter`, writer probe, `spreadsheet.rs` | Third-party dependency behind Fielora renderer adapter | Qualified only for bounded multi-sheet string/decimal/boolean cells and closed styles; formula/merge/image/drawing APIs remain disabled |
| Formula cached-result write | `ABSENT` | `CellData::Formula(String)` writes `<f>` only | `office_oxide` writer | No `<v>` cached result and no observed `calcPr`/forced-recalculation API; formula-bearing export is not qualified |
| XLSX structural reopen | `EXISTS / PRODUCTION` | `spreadsheet.rs` package validator plus targeted `file.extract` writer probe | Artifact renderer adapter | Final bytes are independently reopened for required parts, relationships, sheet order/name, coordinates, literal types/values, formula absence, and package bounds |
| XLSX deterministic bytes | `OBSERVED / NOT CONTRACTUAL` | Writer probe and Spreadsheet renderer tests | Test evidence only | Representative same-input renders are byte-identical; acceptance remains semantic determinism + exact output digest, not ZIP-byte identity |

### Existing renderer/export pattern

| Item | Status | Current module / file | Existing semantic owner | Gap |
|---|---|---|---|---|
| DOCX writer | `EXISTS / PRODUCTION` | Document branch in `crates/fielora-agent/src/artifact.rs` | Artifact renderer adapter | Reusable adapter structure, not workbook semantics |
| PPTX writer | `EXISTS / PRODUCTION` | Presentation branch in `artifact.rs` | Artifact renderer adapter | Reusable adapter structure, not workbook semantics |
| Diagram SVG writer | `EXISTS / PRODUCTION` | `crates/fielora-agent/src/diagram.rs` plus saved export dispatch | Artifact renderer adapter | Demonstrates a type-owned renderer without a new runtime |
| Renderer identity/version | `EXISTS / SPREADSHEET ENABLED` | compact export receipts include `fielora.spreadsheet.xlsx` and `0.1.0+office_oxide.0.1.8` | Existing ToolCall receipt | Calculation authority is explicitly `NONE`; no new receipt hierarchy |
| Output path safety | `EXISTS` | Project-relative containment, sensitive-path rejection, create-only atomic write | Project filesystem + Artifact Tool | Reuse unchanged for `.xlsx` |
| Final-byte validation | `EXISTS / PER FORMAT` | render in memory -> validate package -> atomic write -> reread/hash -> reopen | Artifact renderer adapter | Add XLSX package and semantic reopen checks |
| Structural validation authority | `EXISTS / LIMITED` | Existing DOCX/PPTX/SVG success means structural/semantic roundtrip only | Existing Verification boundary | XLSX reopen cannot mean calculation truth, business truth, or visual quality |
| Export metadata/catalog | `EXISTS / ALIGNED` | `artifact.export` description and capability inspection | Existing Tool catalog | Lists current DOCX/PPTX/SVG/XLSX support and marks XLSX as literal-only; no UI capability added |

### Storage, contracts, and Desktop

| Item | Status | Current module / file | Existing semantic owner | Gap |
|---|---|---|---|---|
| Schema version | `EXISTS / 9` | Storage migration registry | Storage | Must remain 9 for the candidate first slice |
| Persisted Artifact type token | `EXISTS / TYPE-EXTENSIBLE` | `0009_artifact_type_extensibility.sql` | SQLite structural invariant | Already admits bounded canonical `SPREADSHEET`; Rust Domain remains closed until explicitly extended |
| Unknown type fail-closed | `EXISTS` | Storage decode rejects a bounded future token as `ARTIFACT_TYPE_UNSUPPORTED` | Rust Artifact contract | Must continue after adding the one typed Spreadsheet token |
| Generic revision content storage | `EXISTS` | `artifact_revisions.content_json`, schema version 1, 256 KiB bound | Artifact Core | No type-specific table is needed or allowed for the first slice |
| Typed DTO convention | `EXISTS` | Rust structs/tagged enums, Serde unknown-field denial, generated TypeScript | Contracts | Spreadsheet should use closed tagged values and validator-owned bounds; arbitrary maps/JSON are rejected |
| Numeric DTO convention | `EXISTS / SPREADSHEET TOKEN` | Existing contracts plus `SpreadsheetDecimalV1` | Contracts | Spreadsheet persists a bounded canonical decimal token and performs checked conversion only at render time |
| Desktop spreadsheet preview/editor | `ABSENT` | No workbook/sheet/cell surface | None | Explicitly out of scope |
| Desktop table primitive | `PARTIAL / NOT REUSABLE AS EDITOR` | `MarkdownMessage.tsx` renders a read-only HTML table | Conversation renderer | It is not a virtualized grid, workbook model, editor, or Artifact consumer |

## SPREADSHEET_DEFINITION

```text
SpreadsheetArtifactV1
  = ordered bounded worksheets
  + stable sheet-local identity
  + sparse typed literal cells
  + small renderer-neutral format/presentation intent
  + future Fielora-owned calculation semantics
```

A Spreadsheet Artifact is not:

- XLSX/CSV bytes, a ZIP package, XML parts, an HTML table, or a screenshot;
- an Excel process, workbook handle, calculation cache, or external-edit session;
- arbitrary formula text, JavaScript, Python, shell, VBA, DDE, Power Query, or
  an Office macro container;
- a generic JSON document, relational database, DataFrame runtime, or new
  Artifact store;
- a charting runtime, dashboard, UI grid, File Intelligence import path, or
  bidirectional reconciliation system;
- a source of factual or Verification authority merely because calculations or
  structural reopen succeeded.

XLSX is a rendered representation of one exact revision. A future CSV export
would be explicitly lossy and single-sheet: it cannot preserve workbook order,
typed formatting, merges, formula identity, or multiple sheets, so it must not
be called a Spreadsheet roundtrip.

## ARTIFACT_CORE_INTEGRATION_BOUNDARY

| Concern | Ruling | First-slice delta |
|---|---|---|
| Top-level architecture | `REUSE` | Remain `Model + Harness + Tools`; no Spreadsheet runtime or agent |
| Artifact identity | `REUSE` | Existing `ArtifactId` and exact immutable `ArtifactRevisionId` |
| Artifact type/content | `EXTEND` | Add one closed `SPREADSHEET` type and typed content variant |
| Create/read/update | `EXTEND` | One canonicalization/validation branch; same Tool names and effects |
| Export | `EXTEND` | Saved revision -> Spreadsheet renderer adapter -> `.xlsx` |
| Revision/conflict | `REUSE` | Full-replacement update with existing `expected_revision_id` CAS |
| Idempotency/recovery | `REUSE` | Existing semantic request digest and commit-before-receipt recovery |
| Policy/Approval | `REUSE` | Existing Tool effects; no formula-, renderer-, or Spreadsheet-specific permission engine |
| Receipt | `EXTEND` | Add bounded Spreadsheet/render facts to the existing ToolCall receipt |
| Verification | `REUSE` | Exact Artifact revision subject and freshness; export success is not PASS |
| Storage | `REUSE` | Existing schema-9 rows and immutable revision JSON; no new table/migration |
| File Intelligence | `REUSE FOR REOPEN ONLY` | Parser may validate final XLSX bytes; extraction is not Artifact import |
| UI/FIPC | `NONE` | No Desktop contract or surface in the first slice |

The execution path remains:

```text
artifact.create / artifact.update / artifact.read / artifact.export
  -> existing Tool definition and selection
  -> existing PolicyEngine / Approval routing
  -> existing ToolExecutor
  -> existing DurableArtifactToolExecutor / Artifact renderer adapter
  -> existing durable ToolCall receipt
  -> existing exact-revision Verification and freshness boundary
```

There is no `spreadsheet.create`, `spreadsheet.calculate`, or
`spreadsheet.export` Tool family in the first slice.

## SEMANTIC_MODEL_CANDIDATE

The following contract is implemented by the first slice in Rust and generated
TypeScript. It remains a Candidate for future evolution; the ownership and
bounds must not be weakened without a separate review.

```text
SpreadsheetArtifactV1
  title: Option<String>
  sheets: Vec<SpreadsheetSheetV1>          // input order is non-semantic

SpreadsheetSheetV1
  sheet_id: SpreadsheetSheetId             // stable inside the Artifact
  name: String                              // user-visible, XLSX-admissible
  cells: Vec<SpreadsheetCellV1>             // sparse, order-insensitive

SpreadsheetCellV1
  row: u32                                  // one-based semantic coordinate
  column: u16                               // one-based semantic coordinate
  value: SpreadsheetLiteralV1
  format: Option<SpreadsheetFormatIntentV1>
  presentation: Option<SpreadsheetCellPresentationIntentV1>

SpreadsheetLiteralV1
  STRING { value: String }
  DECIMAL { value: SpreadsheetDecimalV1 }
  BOOLEAN { value: bool }

SpreadsheetFormatIntentV1
  GENERAL
  TEXT
  INTEGER
  DECIMAL_2
  PERCENT_2

SpreadsheetCellPresentationIntentV1
  emphasis: NORMAL | HEADER | TOTAL
  alignment: AUTO | LEFT | CENTER | RIGHT
  wrap: bool
```

An absent sparse coordinate is blank. The first slice does not need an
explicit empty value because updates replace the complete typed workbook:
omitting a prior coordinate clears it. A present cell must contain a non-empty
typed literal; presentation-only empty cells are deferred.

### Identity and order

- `ArtifactId` identifies the workbook; `SpreadsheetSheetId` identifies a
  sheet only inside that Artifact.
- Sheet IDs use the existing bounded local-ID style: canonical ASCII token,
  unique within the workbook, independent of the visible sheet name.
- Sheet vector input order is not semantic in the first slice. Canonicalization
  sorts sheets by stable sheet ID, and the XLSX renderer uses that canonical
  order as its deterministic tab order. User-authored tab ordering is deferred.
- A cell is identified by `(sheet_id, row, column)` in V1. There is no global
  `CellId`, row object, column object, or cell revision.
- Cell vector order is not semantic. Duplicate coordinates fail closed.
- A sheet rename preserves sheet ID and changes semantic content. Reordering
  only the input sheet array does not change canonical content or the digest.
- Future formulas must refer to stable sheet IDs and typed coordinates, not
  unparsed A1/name strings as Artifact source.

### Candidate first-slice bounds

The canonical `content_json` remains subject to the existing 256 KiB Storage
and Artifact-definition limit and 128 KiB total text limit. Tighter semantic
bounds are implemented:

| Dimension | Candidate bound |
|---|---:|
| Sheets | 32 |
| Rows per sheet | 2,000 addressable rows |
| Columns per sheet | 256 addressable columns |
| Non-empty cells total | 4,096 |
| Cell text | 1,024 UTF-8 bytes |
| Sheet name | XLSX-compatible 1..31 characters after validation |
| Title | Reuse existing bounded Artifact title/content title convention |
| Decimal precision | At most 15 significant decimal digits; no exponent, NaN, infinity, or signed zero |
| Rendered XLSX | Reuse existing 16 MiB Artifact export ceiling |

The 4,096-cell bound aligns with the existing bounded Artifact table ceiling;
the address range aligns with the proven `file.extract` reopen envelope while
keeping sparse content well inside the revision JSON bound.

### Decimal authority

The semantic contract should not persist `f64` directly. It should persist a
canonical decimal token with one lexical representation:

- no exponent notation;
- no leading `+`, redundant leading/trailing zeroes, or `-0`;
- at most 15 significant digits so conversion to Excel's IEEE-754 number model
  is bounded and testable;
- conversion to the renderer's `f64` is checked and deterministic;
- the reopened XLSX number must normalize back to the same admitted decimal or
  the export fails.

This preserves `Eq`-like contract behavior and stable JSON/digests while making
the XLSX precision boundary explicit. It does not claim arbitrary financial or
high-precision decimal arithmetic.

### Presentation and formats

Only a small closed intent is semantic. Font files, font names, raw colors,
arbitrary number-format strings, raw column widths, row heights, borders,
conditional formatting, print layout, freeze panes, images, drawings, and
manual geometry remain renderer/package concerns or future contract deltas.

The renderer may derive deterministic column widths from admitted content and
the closed presentation intent. Derived widths are not persisted and do not
enter the semantic digest. Dates, date-time, currency, locale-specific formats,
and the Excel 1900/1904 date-system choice are deliberately not in the first
slice; current read capability does not constitute a complete semantic policy
for them.

### Merges and charts

Merged cells and charts are not admitted in the first slice.

- A merge is not merely an XLSX writer call. It needs overlap, anchor-cell,
  blank-covered-cell, canonicalization, accessibility, and formula-reference
  semantics.
- A chart needs typed series/category/reference semantics, layout intent,
  renderer support, and visual validation. Extracted chart text is insufficient.
- Images, drawings, text shapes, pivots, tables as OOXML objects, external data,
  and embedded objects are likewise excluded.

## CANONICALIZATION_AND_DIGEST

Spreadsheet canonicalization is type-owned but returns through the existing
Artifact canonicalization result. The candidate rules are:

1. validate the complete typed workbook before rendering or persistence;
2. sort sheets by stable sheet ID;
3. normalize each sheet ID/name and reject duplicate IDs or case-insensitive
   duplicate visible names;
4. sort sparse cells by `(row, column)` and reject duplicate coordinates;
5. normalize decimal lexical form and explicit default presentation intent;
6. preserve admitted UTF-8 text bytes, including tab/CR/LF, while rejecting
   other control characters;
7. serialize the typed `ArtifactContentV1::Spreadsheet` to canonical JSON;
8. compute the existing semantic SHA-256 over those canonical bytes.

The semantic digest includes sheet IDs/names, cell coordinates, typed literal
values, format intent, and presentation intent. It excludes:

- XLSX ZIP/XML bytes and package entry order;
- output path, renderer ID/version, export timestamp, and output digest;
- derived column widths or other renderer geometry;
- a future calculation cache, dependency graph, or display cache;
- File Intelligence observation text;
- Excel/LibreOffice application state.

Semantically equivalent sheet and cell input order must produce the same
canonical bytes and digest. Sheet rename, cell movement,
literal/format/presentation change, or type change must alter the digest.

## FORMULA_AND_CALCULATION_AUTHORITY

### Authority ruling

```text
Formula source
  -> future closed typed Spreadsheet expression
  -> bounded Fielora-owned pure calculator
  -> deterministic derived result + calculation provenance
  -> renderer translation to a safe XLSX formula subset, if qualified

Excel cached result / Excel recalculation / imported formula text
  != Fielora semantic authority
  != Verification PASS
```

The Model may propose Spreadsheet content, but it cannot grant execution
permission or assert a calculated result as verified. The renderer cannot own
calculation semantics. `office_oxide`, Excel, LibreOffice, an XLSX cached value,
or `file.extract` cannot silently become the calculator of record.

### Future formula contract boundary

Formula support, when separately authorized, should use a closed typed AST,
not arbitrary `=...` strings. A review candidate may include:

- canonical decimal/boolean literals;
- stable typed cell and rectangular range references by sheet ID + coordinate;
- bounded unary and binary numeric operators;
- a small allowlist such as `SUM`, `AVERAGE`, `MIN`, `MAX`, and `COUNT`;
- explicit typed calculation errors;
- a bounded dependency graph, AST depth/node count, operation budget, and
  deterministic cycle rejection;
- a versioned calculation engine ID and result digest.

It must exclude volatile time/random functions, external workbook references,
URLs, `WEBSERVICE`, `HYPERLINK`, DDE, OLE, macros, dynamic code, shell/process,
file/network access, add-ins, user-defined functions, `INDIRECT`, dynamic arrays,
and arbitrary function/source passthrough.

Exact coercion, blank, range, error-propagation, rounding, precision, and cycle
semantics must be specified before enabling any formula. “Behaves like Excel”
is not a contract.

### Derived calculation result

A future calculated value is derived from exact semantic content plus a
calculation-engine version. It is not caller-authored truth. The preferred
boundary is:

- persist the formula AST as semantic content;
- calculate in a pure, bounded in-process adapter;
- do not admit a caller-provided cached result as authority;
- bind any returned/exported calculated result to revision semantic SHA,
  calculator ID/version, and calculation-result SHA;
- keep calculation success separate from Verification PASS and factual truth;
- invalidate/recompute derived results when the exact revision or calculator
  version changes.

### Why formulas are excluded from the first slice

Current `office_oxide::xlsx::write::CellData::Formula` accepts an arbitrary
string and emits only `<f>...</f>`. The audited writer source does not emit a
cached `<v>` result and exposes no observed `calcPr`/force-recalculation
contract. Consequently:

- raw writer formula input would violate the typed-formula boundary;
- a structurally valid file could open with a missing/stale displayed result;
- an Office application could recalculate under different semantics;
- an unsafe external/volatile formula could execute after the user opens it;
- structural reopen could prove formula source presence but not the claimed
  calculation result.

The first slice therefore rejects formula cells. Text beginning with `=` is
written as an inline string and remains text. A later formula slice must qualify
or adapt the backend and prove source/result/recalculation behavior without a
new permission, receipt, Verification, or Agent runtime.

## XLSX_RENDERER_EXPORT_REALITY

### Backend ruling

`office_oxide 0.1.8` is already an exact-pinned direct workspace dependency and
is used by production Artifact DOCX/PPTX writing and File Intelligence reading.
Its XLSX writer is the implemented first-slice backend because it adds no
dependency and passed the bounded writer qualification below. This acceptance
is limited to the literal-only subset.

The source audit confirms writer APIs for:

- ordered worksheets;
- sparse literal string/number/boolean cells;
- formula source strings;
- closed styles and built-in number formats;
- column widths and merged ranges;
- page setup, images, and text shapes.

Only literal cells and small closed styles/formats are implemented for the
first slice. Formula strings, merges, page setup, images, drawings,
embedded fonts, and shapes remain disabled even though the dependency exposes
them.

### Renderer adapter candidate

```text
ArtifactContentV1::Spreadsheet
  -> Spreadsheet validator/canonicalizer
  -> literal calculation mode (`LITERAL_ONLY`, formula count = 0)
  -> `fielora.spreadsheet.xlsx`
  -> exact-pinned `office_oxide 0.1.8`
  -> bounded in-memory XLSX bytes
  -> package/security/semantic reopen
  -> existing contained atomic create-only Project write
  -> final-byte reread/hash/reopen
  -> existing compact ToolCall receipt
```

Proposed renderer provenance:

```text
renderer_id = fielora.spreadsheet.xlsx
renderer_version = 0.1.0+office_oxide.0.1.8
calculation_authority = NONE
formula_count = 0
```

### Writer qualification result

The repository-owned targeted probe renders representative in-memory fixtures
twice and proves:

- non-empty bounded XLSX bytes;
- observed byte-identical output for the same fixture (recorded as evidence,
  not made an Artifact semantic requirement);
- valid ZIP/OPC structure and required parts;
- exact sheet count/order/name and CJK/Latin text reopen;
- exact sparse coordinate/type/value reopen for text, decimal, and boolean;
- closed format/presentation mapping reopen;
- zero formula, cached formula, macro, external relationship, link, drawing,
  image, embedded object, or encryption part;
- no time, random, environment, network, filesystem-read, or process input;
- failure leaves no final file.

The gate passed with the existing dependency. The production adapter does not
rely on byte identity: canonical JSON/digest is semantic authority, while each
generated file receives its own output digest and semantic reopen. No Excel
process, dependency change, or parallel writer runtime was introduced.

### Structural reopen model

The first-slice XLSX validator should combine the current secure OOXML admission
with exact semantic checks:

1. ZIP signature, entry-count/size/path/duplicate/symlink and XML bounds;
2. required `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`,
   `xl/styles.xml`, and each declared worksheet part;
3. macro/encryption/external-relationship/DTD rejection;
4. independent bounded `quick_xml` parsing of the controlled generated subset;
5. exact sheet order/name and sparse coordinate/type/value comparison;
6. closed number-format/presentation intent-to-writer mapping plus style-index
   presence on reopened styled cells;
7. formula count exactly zero;
8. final written bytes equal rendered size/hash and independently pass the same
   reopen checks.

Reopen success means only: the exact final XLSX bytes are a bounded package
whose admitted literal workbook semantics match the exact Artifact revision. It
does not mean Excel visual quality, formula correctness, business correctness,
factual correctness, or Verification PASS.

### Security boundary

The first-slice renderer must be static and in-process:

- no network, external file read, Office/Excel process, shell, script, macro,
  plugin, MCP, or model call;
- no external relationships, formulas, hyperlinks, DDE, OLE, VBA, query tables,
  connections, external workbook links, images, or embedded objects;
- strings are emitted as inline strings; a leading `=`, `+`, `-`, or `@` does
  not convert text into a formula;
- no raw OOXML, relationship, ZIP entry, style code, or formula passthrough from
  Artifact content;
- existing Project containment, sensitive-path denial, create-only output,
  atomic write, cancellation, and cleanup are reused unchanged.

## TOOL_RECEIPT_AND_VERIFICATION_MODEL

The existing Tools remain the only executable surface:

| Tool | Existing effect | Spreadsheet ruling |
|---|---|---|
| `artifact.create` | `STATE_MUTATION` | Add typed `SPREADSHEET`; same Policy/Approval/receipt/recovery path |
| `artifact.read` | `OBSERVE` | Return exact typed revision as `UNTRUSTED_ARTIFACT_CONTENT` |
| `artifact.update` | `STATE_MUTATION` | Full replacement with existing expected-revision conflict semantics |
| `artifact.export` | `WORKSPACE_WRITE` | Saved exact revision to a new contained `.xlsx`; no inline Spreadsheet in V1 |

The existing export receipt may add compact fields:

- Artifact ID/type/revision/sequence/content schema/semantic SHA;
- renderer ID/version and `output_format = XLSX`;
- output relative path, size, and SHA-256;
- sheet and non-empty-cell counts;
- formula count `0`, calculation authority `NONE`;
- structural reopen `true` and final-byte check `true`.

It must not contain full cell content, full workbook JSON, raw XLSX/XML, or any
new `SpreadsheetReceipt` hierarchy. The current durable ToolCall record remains
the receipt owner.

Calculation or structural export does not issue Verification PASS. Existing
Verification continues to bind evidence to one exact `ARTIFACT_REVISION` and
semantic SHA. Updating a Spreadsheet produces a new revision and makes evidence
for the previous revision stale under the existing freshness rules.

## REUSE_EXTEND_NEW

| Classification | Capability |
|---|---|
| `REUSE` | Artifact identity, immutable revisions, current revision pointer, CAS conflict, historical read, idempotency, recovery, profile/project/conversation/run lineage |
| `REUSE` | Tool catalog/PolicyEngine/Approval/ToolExecutor/durable ToolCall receipt/Verification and content-authority boundaries |
| `REUSE` | Project-relative containment, sensitive-path denial, atomic create-only write, cancellation, final reread/hash |
| `REUSE` | Schema-9 bounded Artifact type token and generic revision JSON storage |
| `REUSE` | Exact-pinned `office_oxide 0.1.8` only after targeted XLSX writer qualification |
| `EXTEND` | `ArtifactType`, `ArtifactContentV1`, typed Rust DTOs, generated TypeScript, and tool JSON schema with one Spreadsheet variant |
| `EXTEND` | Artifact validation/canonicalization dispatch and semantic-unit count |
| `EXTEND` | Saved `artifact.export` dispatch, renderer provenance, output extension, and format metadata |
| `EXTEND` | Existing Artifact/Core/Storage/Verification fixtures with a Spreadsheet case |
| `NEW` | Typed Spreadsheet semantic DTOs and local sheet identity |
| `NEW` | Spreadsheet validator/canonicalizer module owned by the Artifact adapter |
| `NEW` | XLSX renderer adapter and exact semantic reopen checks |
| `NEW / LATER` | Typed formula AST and Fielora-owned bounded calculation adapter |
| `ABSENT / DEFER` | Spreadsheet UI/editor/preview, import/reconciliation, formulas in first slice, dates/currency/locale, merges, charts, images, macros, links, external data, CSV export |

`NEW` means a bounded module/contract contribution under the existing Artifact
and Tool owners. It does not mean a new top-level Runtime, store, Tool family,
permission engine, receipt hierarchy, or Verification engine.

## CONTRACT_DELTA_CANDIDATE

The literal-only first slice would require these additive contract changes:

1. add `ArtifactType::Spreadsheet` serialized as `SPREADSHEET`;
2. add `ArtifactContentV1::Spreadsheet(SpreadsheetArtifactV1)`;
3. add the closed Spreadsheet DTOs, tagged literal enum, format/presentation
   enums, and bounded `SpreadsheetSheetId` newtype;
4. extend `ArtifactContentV1::artifact_type()` and Storage encode/decode;
5. extend Core's closed `ArtifactToolType` and Tool input schemas;
6. extend canonicalization dispatch and semantic-unit count;
7. extend saved `artifact.export` to accept `.xlsx` for Spreadsheet only;
8. extend existing export receipt JSON with bounded renderer/Workbook facts;
9. regenerate TypeScript contracts and prove the generated file is current;
10. factually align Tool/capability metadata to current DOCX/PPTX/SVG plus XLSX.

No contract delta is proposed for:

- Artifact IDs/revision IDs or mutation kinds;
- Storage tables, `content_schema_version`, schema version, or migration registry;
- Policy, Approval, Tool effects, ToolCall records, receipts, Verification
  subjects, authority labels, or freshness;
- FIPC/Desktop APIs;
- formulas or calculation results in the literal-only first slice.

A later formula slice is a separate contract and security Change Impact. It
must not be smuggled in as a free-form string field.

## CHANGE_IMPACT

| Area | Level | Candidate impact |
|---|---|---|
| Product architecture | `LOW` | One additive Artifact type; no new product hierarchy or Runtime |
| Domain contracts | `HIGH` | Closed Rust/TS Artifact unions and typed DTOs change; unknown fields/types must remain fail-closed |
| Storage/schema | `LOW` | Schema remains 9; existing generic Artifact rows admit the token; no table/migration |
| Tool pipeline | `MEDIUM` | Existing four Tools gain one typed type/format dispatch; effects and approval unchanged |
| Renderer/export | `HIGH / VALIDATED FIRST SLICE` | Existing XLSX writer is qualified only for the bounded literal subset; package security and semantic reopen are enforced |
| Formula/security | `HIGH / DEFERRED` | Calculation authority and formula injection are major boundaries; first slice rejects formulas |
| Verification/evidence | `LOW` | Reuse exact Artifact-revision binding; add compact provenance only |
| Recovery/idempotency | `LOW` | Existing semantics reused, with new fixtures |
| Desktop/FIPC | `NONE` | No UI or Desktop contract |
| Dependency/build | `NONE` | No dependency addition or version change |
| Rapid Desktop route | `NONE` | Subordinate Artifact track; no phase/version change |

## FIRST_SLICE_IMPLEMENTED

### Recommended scope

`FIRST_DURABLE_LITERAL_SPREADSHEET_ARTIFACT_SLICE`

The authorized first slice implements only:

- the typed literal-only Spreadsheet DTOs and `SPREADSHEET` Artifact variant;
- bounded validation, stable sheet identity, sparse-cell canonicalization, and
  semantic digest;
- existing `artifact.create/read/update` support with full-replacement update;
- saved exact-revision `.xlsx` export through a qualified in-process
  `office_oxide` adapter;
- deterministic renderer provenance, secure package validation, exact literal
  semantic reopen, final-byte reread/hash;
- existing conflict, idempotency, recovery, historical export, receipt,
  Verification subject, freshness, and `UNTRUSTED_ARTIFACT_CONTENT` evidence;
- representative CJK/Latin, multi-sheet, sparse, text/decimal/boolean, format,
  historical revision, conflict, and recovery fixtures.

Explicitly exclude:

- formulas and calculation engine;
- dates/date-time, currency/locale, arbitrary formats;
- merges, charts, tables as OOXML objects, images, shapes, links, external data,
  macros, pivots, conditional formatting, print setup, embedded fonts;
- CSV, import, file-to-Artifact conversion, external-edit reconciliation;
- UI, preview, editor, FIPC, Excel/LibreOffice automation;
- new Tool names, Runtime, receipt/permission/Verification systems;
- migration or dependency changes.

### Acceptance gates for an authorized implementation

| Gate | Required result |
|---|---|
| Typed model | No arbitrary JSON, OOXML, formula string, XLSX/CSV source bytes |
| Artifact Core reuse | Existing revisions/conflict/idempotency/recovery/Verification inherited |
| No migration | Schema remains 9; migration 0008/0009 unchanged |
| Bounds | Sheet/address/cell/text/decimal/content/output limits fail closed |
| Canonicalization | Sheet and cell input ordering are non-semantic; stable digest |
| Decimal | Canonical token and XLSX numeric reopen match admitted precision policy |
| XLSX writer | Exact-pinned existing dependency; no new dependency/process/network/file read |
| Determinism | Same semantic workbook -> same canonical JSON/digest; ZIP-byte identity is observed but not required |
| Security | Zero formula/macro/external rel/link/drawing/object/code path |
| Structural reopen | Required parts and exact literal workbook semantics pass independently |
| Tool path | Existing create/read/update/export effects and Policy/Approval/ToolExecutor path |
| Historical export | R1/R2 exact saved revisions export their own content |
| Conflict/recovery | Existing CAS and commit-before-receipt recovery unchanged |
| Verification | Exact revision binding unchanged; export success creates no PASS |
| Content authority | Read cells remain `UNTRUSTED_ARTIFACT_CONTENT` |
| Regression | Document/Presentation/Diagram Artifact behavior remains green |
| Scope | 0 UI/formula/import/CSV/new Runtime/migration/dependency |

### Stop conditions

Stop implementation if any of these is true:

- Spreadsheet needs a new DB table, migration, content blob store, or parallel
  revision/recovery path;
- a new Spreadsheet-specific create/update/export Tool is required;
- XLSX bytes, raw OOXML, arbitrary formula text, or external application state
  must become source of truth;
- the current writer cannot produce bounded literal workbooks or exact semantic
  reopen without a dependency/runtime expansion;
- string input cannot be guaranteed to remain literal text;
- renderer/package validation requires network, external file reads, an Office
  process, shell, script, macro, or plugin;
- formula execution is required to make the first slice credible;
- the current Artifact Core cannot add one typed variant without weakening
  unknown-type fail-closed behavior;
- a Frozen/Baseline architecture document or schema 9 must change;
- UI is required to prove the backend Artifact semantics.

## TARGETED_VALIDATION

For this implementation, run only affected gates plus current Artifact
regressions:

- Spreadsheet contract, validation, canonicalization, decimal, renderer,
  package-security, and structural-reopen unit tests;
- existing Agent Artifact/Office writer tests;
- Core durable Artifact inheritance fixture extended with Spreadsheet;
- Storage schema-9 typed roundtrip and unknown future-token fail-closed tests;
- generated contract regeneration/current check;
- Document/Presentation/Diagram Artifact regressions;
- affected Rust format/test/Clippy and Core integration tests;
- docs/context audit and `git diff --check`.

Do not run Browser/Desktop E2E, packaged/portable smoke, or full premerge for
this backend-only Slice. The known unrelated Browse startup timeout is not a
Spreadsheet issue and is not repaired here.

### Recorded implementation evidence

- writer Gate: the existing `office_oxide 0.1.8` writer produced two bounded
  sheets with string/number/boolean sparse cells, reopened through the existing
  XLSX read/extract path, emitted no formula/macro/external relationship, and
  produced byte-identical output in the representative probe;
- production semantic Gate: CJK/Latin and XML-special text, decimals, booleans,
  sparse coordinates, closed style intents, and formula-like strings reopened
  through the independent bounded package parser with exact literal semantics;
- Artifact Gate: the existing coordinator/Policy/Approval/ToolExecutor path
  created, read, updated, and historically exported R1/R2; ToolCall replay was
  idempotent, stale CAS failed, commit-before-receipt recovery survived restart,
  exact-revision Verification became stale after mutation, and read content
  remained `UNTRUSTED_ARTIFACT_CONTENT`;
- Storage Gate: schema 9 accepted the typed `SPREADSHEET` token/content through
  generic Artifact rows while profile isolation, immutable revisions, unknown
  future-token fail-closed behavior, and `content_schema_version=1` remained;
- regressions: Agent 110/110, Office writer probes 4/4, Core 28/28, Storage
  22/22, Desktop TypeScript 176/176, and Core integration 12/12 passed through
  the repository Core/Cross lanes; Rust fmt, workspace Clippy `-D warnings`,
  contracts current, docs/context manifest, and release Core build passed;
- scope: migrations/dependencies/UI/FIPC/Formula/Calculator/import/chart/new
  Runtime changes are zero. Browser/Desktop visual E2E, packaged/portable smoke,
  and full premerge were not run by design.

### Known first-slice limitations

- no Spreadsheet preview or visual-quality claim exists;
- style reopen proves the closed semantic intent maps to the expected writer
  style and the final cell references a style; it does not claim arbitrary Excel
  style fidelity;
- the independent production parser is used for exact XML-special literal
  checks because the current general XLSX extraction parser is not the semantic
  authority for authored Spreadsheet revisions;
- ZIP bytes happen to be stable for the current fixtures but byte identity is
  not guaranteed as part of the Artifact contract;
- formulas, calculation, dates, merges, charts, import/reconciliation, CSV, and
  editing remain outside this slice.

## OPEN_QUESTIONS

1. Literal-only has been accepted and implemented as the first slice. Whether
   formulas provide enough next value to justify their security/semantic cost
   remains open.
2. Representative `office_oxide 0.1.8` output is byte-identical in the current
   probe, but byte identity remains non-contractual. Full visual/style fidelity
   outside the closed intent mapping is not claimed.
3. Is 15 significant decimal digits the right long-term Fielora/Excel interoperability
   boundary, and what exact rounding rule is required for future arithmetic?
4. The first slice preserves admitted UTF-8 bytes and tab/CR/LF. A future
   cross-format newline-normalization policy, if needed, requires a contract
   delta rather than a renderer rewrite.
5. Before formula support, what exact blank/text coercion, error propagation,
   range, cycle, rounding, and comparison rules form the Fielora calculator?
6. Formula-bearing XLSX needs a deliberate cached-result/recalculation policy.
   The current writer has no audited cached-value or calculation-properties API.
7. Dates require an explicit semantic type, timezone-free/date-time policy, and
   fixed 1900/1904 export choice; current File Intelligence output is not enough.
8. Merges require semantic overlap/anchor/reference rules; charts require a
   separate typed model and visual gate. Neither belongs in the first slice.
9. Import and bidirectional external-edit reconciliation are separate trust,
   identity, conflict, and provenance problems. `file.extract` is not import.
10. A future CSV representation must declare one sheet and explicit lossy
    semantics; it cannot be a durable Spreadsheet source format.

## NEXT_DECISION

`FIRST_DURABLE_LITERAL_SPREADSHEET_ARTIFACT_SLICE_IMPLEMENTED`

The bounded literal-only implementation and writer qualification are complete
under this Candidate. Formula/calculation remains a separately gated
high-impact delta; no next Spreadsheet feature is authorized by this status.
