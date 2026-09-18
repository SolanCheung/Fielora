# Agent visual and tool feedback repair — 2026-09-13

User flow: resume a screenshot-based UI repair, operate the built-in browser, see the actual failure, correct a guarded edit, and verify the requested result.

Confirmed production evidence: run `01a09553-7a96-7f82-baa5-b78b40157b9c` reached step 170. All 18 invalid apply_patches calls placed expected_sha256 at the root. A successful controller edit inserted an extra closing brace. Browser screenshot receipts contained durable image metadata but the Harness sent no captured pixels to the Model. Inspection read only the top document and could miss a development-error iframe. Model statements repeatedly reversed the expected fields; this is not proof that the user changed the requirement.

Changes stay within Model + Harness + Tools: canonicalize only an unambiguous single-patch root hash before existing policy/admission/SHA validation; preserve actionable failure details; deliver the latest owned, integrity-checked browser screenshot as observed multimodal context, distinct from original user images; expose bounded same-origin embedded document text and precise browser argument feedback. Original user evidence is retained through compaction. No schema, migration, credential, permission expansion, arbitrary JavaScript capability, or automatic financial transaction.

Risk controls: conflicting/multiple-patch hashes remain invalid; no path/content/hash is invented. Screenshots must belong to this run/tool/conversation and pass blob integrity and size checks. Keep only the latest browser capture in model context while retaining the durable evidence ledger. Cross-origin frames remain unreadable; report that limitation instead of claiming an empty page. Tool success still does not mean goal completion. No deterministic claim that a model has understood an image.

Validation: negative argument/ownership/integrity cases, real Electron embedded-error observation and screenshots reaching a provider-neutral model request, continued guarded edit and checks. Use isolated fixtures, zero external model calls and zero production writes. Real Qwen convergence and the original business repair remain separate acceptance work.
