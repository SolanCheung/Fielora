# Fielora V0.1 File Intelligence Read / Extract Candidate

**Status:** DRAFT / CANDIDATE / NOT FROZEN

**Scope:** First rich-file read/extract slice only
**Change Impact:** HIGH — untrusted document parsing and new parser dependencies

## 1. Architecture placement

This slice preserves the canonical `Model + Harness + Tools` architecture:

```text
Model
  → Harness selection / PolicyEngine / ToolCall lifecycle
  → existing ToolExecutor
  → file.extract
  → bounded PDF or OOXML adapter
  → existing Tool observation / receipt / Context
```

`file.extract` is one built-in `OBSERVE` Tool. It does not add a File Agent,
Artifact Runtime, permission engine, receipt hierarchy, verification engine, or
product UI. Existing `read_file` remains the text/code reader.

## 2. Input and output contract

Input is exactly one non-empty project-relative `path`. Absolute paths, URLs,
stdin/body input, parent traversal, sensitive paths, and symlink/junction escape
are denied through the existing project containment boundary plus same-file
handle identity checks.

Supported formats are PDF, DOCX, PPTX, and XLSX. The provider-neutral output is:

- `format`;
- optional metadata (`title`, `page_count`, `slide_count`, `sheet_count`);
- ordered `sections[]` with `index`, optional `label`, and deterministic text;
- `truncated`, bounded `warnings[]`, and
  `authority=UNTRUSTED_PROJECT_CONTENT`.

Tool observations are bounded to 128 KiB. Content has no instruction, policy,
permission, semantic, or verification authority.

## 3. Admission and resource bounds

- source file: 32 MiB;
- normalized text: 96 KiB inside a 128 KiB observation;
- sections: 512; warnings: 32; timeout: 10 seconds;
- PDF objects: 100,000; load/page stream expansion: 8 MiB;
- OOXML ZIP entries: 4,096; one expanded entry: 8 MiB; total expanded data:
  64 MiB;
- XML depth: 64; attributes/element: 256; events: 1,000,000;
- XLSX: 64 sheets, 2,000 rows/sheet, 256 columns/sheet, 100,000 cells total.

OOXML is admitted before the format parser runs. Admission rejects traversal,
symlink entries, duplicate normalized names, encryption, macros, archive/XML
limits, DTD, malformed XML, extension/signature/container mismatch, and missing
expected package structure. External relationships are not followed and produce
a warning.

PDF uses bounded strict loading and bounded per-page text extraction. It never
renders, executes actions, follows links, opens attachments, processes forms, or
performs OCR. A valid PDF without selectable text returns
`PDF_TEXT_UNAVAILABLE`.

Cancellation and the 10-second timeout are checked before and after parser calls
and throughout archive/XML/page/sheet iteration. The selected libraries do not
offer safe mid-call preemption. Fielora therefore runs them synchronously with
the admission limits above and starts no background parser that could continue
after Tool return; one already-running bounded library call may observe
cancellation or timeout only when that call returns. Hard preemption would
require a future isolated-process design and is not silently claimed here.

## 4. Formula, provenance, and verification boundary

XLSX formula source and a cached value are emitted when present. Formula source
is data only: it is never evaluated and cannot trigger network, file, shell, DDE,
or process access.

The source digest covers the exact bytes read from the admitted open file handle.
The result digest covers the canonical normalized result. The existing durable
ToolCall receipt contains only path, format, source/result digests, source size,
section/warning counts, truncation, authority, and the existing execution-source
envelope; it contains no document body or raw PDF/ZIP/XML.

Extraction success is an observation only. It never creates Verification PASS,
proves document claims true, or completes an AgentRun.

## 5. Explicitly deferred

Creation/edit/export, preview/rendering, OCR, image extraction, layout fidelity,
formula calculation, macros, remote files, credential/UI work, Artifact Runtime,
and file intelligence beyond bounded read/extract remain out of scope. PDF text
extraction is best-effort for the supported embedded-text operators; parser
fidelity defects can surface as `PDF_TEXT_UNAVAILABLE` even when a viewer can
display text.
