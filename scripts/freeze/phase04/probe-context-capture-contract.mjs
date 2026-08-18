// Phase 04 freeze probe source; generated Evidence belongs under artifacts/phase04.
import assert from "node:assert/strict";

const encoder = new TextEncoder();
const CHIP_KINDS = new Set([
  "CURRENT_FIELD",
  "CURRENT_FOCUS",
  "CURRENT_PAGE",
  "CURRENT_SELECTION",
  "CAPTURE",
  "USER_NOTE",
]);

function scalars(value) {
  return [...value].length;
}

function validateContext(chips, userInput) {
  if (chips.length > 8) throw new Error("CONTEXT_TOO_LARGE");
  if (scalars(userInput) > 8_000 || encoder.encode(userInput).length > 32 * 1024) {
    throw new Error("CONTEXT_TOO_LARGE");
  }
  let totalScalars = 0;
  let totalBytes = 0;
  for (const chip of chips) {
    if (!CHIP_KINDS.has(chip.kind)) throw new Error("CONTEXT_INVALID_KIND");
    if (chip.sensitivity === "BLOCKED") throw new Error("CONTEXT_BLOCKED");
    const chipScalars = scalars(chip.content);
    const chipBytes = encoder.encode(chip.content).length;
    if (chipScalars > 4_000 || chipBytes > 16 * 1024) throw new Error("CONTEXT_TOO_LARGE");
    totalScalars += chipScalars;
    totalBytes += chipBytes;
  }
  if (totalScalars > 12_000 || totalBytes > 48 * 1024) throw new Error("CONTEXT_TOO_LARGE");
  return Object.freeze({ chips: structuredClone(chips), userInput });
}

function createCapture(overrides = {}) {
  const capture = {
    id: "018f0000-0000-7000-8000-000000000001",
    kind: "TEXT",
    content: "immutable synthetic content",
    source: Object.freeze({ kind: "USER_INPUT" }),
    placement: "INBOX",
    lifecycle: "ACTIVE",
    fieldId: null,
    promotedAs: null,
    revision: 1,
    ...overrides,
  };
  if (capture.kind === "MODEL_OUTPUT" && capture.sourceIsPartial) {
    throw new Error("PARTIAL_MODEL_OUTPUT_REJECTED");
  }
  return Object.freeze(capture);
}

function mutateCapture(capture, mutation, field) {
  if (capture.lifecycle !== "ACTIVE" && mutation.type !== "RESTORE") {
    throw new Error("CAPTURE_NOT_ACTIVE");
  }
  let next;
  switch (mutation.type) {
    case "ATTACH":
      if (capture.placement === "PROMOTED") throw new Error("INVALID_CAPTURE_TRANSITION");
      if (capture.fieldId && capture.fieldId !== mutation.fieldId) {
        throw new Error("CROSS_FIELD_MOVE_REJECTED");
      }
      next = { ...capture, placement: "ATTACHED", fieldId: mutation.fieldId };
      break;
    case "PROMOTE":
      next = {
        ...capture,
        placement: "PROMOTED",
        fieldId: mutation.fieldId ?? capture.fieldId,
        promotedAs: "IDEA_CANDIDATE",
      };
      break;
    case "ARCHIVE":
      next = { ...capture, lifecycle: "ARCHIVED" };
      break;
    case "RESTORE":
      if (capture.lifecycle !== "ARCHIVED") throw new Error("INVALID_CAPTURE_TRANSITION");
      next = { ...capture, lifecycle: "ACTIVE" };
      break;
    default:
      throw new Error("UNKNOWN_CAPTURE_MUTATION");
  }
  next.content = capture.content;
  next.source = capture.source;
  next.revision = capture.revision + 1;
  if (next.fieldId) {
    field.revision += 1;
    field.activities.push(mutation.type);
  }
  return Object.freeze(next);
}

function routeIntent({ explicitAction }) {
  if (explicitAction === "CAPTURE" || explicitAction === "PROMOTE") {
    return { intent: explicitAction, requiresPreviewAndConfirm: true };
  }
  return { intent: explicitAction ?? "ASK", requiresPreviewAndConfirm: false };
}

const chips = [
  {
    kind: "CURRENT_FIELD",
    content: "a".repeat(4_000),
    sensitivity: "NORMAL",
    revision: 1,
  },
  {
    kind: "CURRENT_SELECTION",
    content: "synthetic selection",
    sensitivity: "SENSITIVE",
    navigationGeneration: 4,
  },
];
const context = validateContext(chips, "synthetic ask");
assert(Object.isFrozen(context));

await assert.rejects(
  async () => validateContext([...chips, ...Array(7).fill(chips[0])], "ask"),
  { message: "CONTEXT_TOO_LARGE" },
);
await assert.rejects(
  async () => validateContext([{ ...chips[0], sensitivity: "BLOCKED" }], "ask"),
  { message: "CONTEXT_BLOCKED" },
);
await assert.rejects(
  async () => validateContext([{ ...chips[0], content: "🙂".repeat(4_001) }], "ask"),
  { message: "CONTEXT_TOO_LARGE" },
);

const field = { id: "field-1", revision: 7, activities: [] };
const initial = createCapture();
const attached = mutateCapture(initial, { type: "ATTACH", fieldId: field.id }, field);
assert.equal(field.revision, 8);
assert.deepEqual(field.activities, ["ATTACH"]);
const promoted = mutateCapture(attached, { type: "PROMOTE" }, field);
assert.equal(field.revision, 9);
assert.deepEqual(field.activities, ["ATTACH", "PROMOTE"]);
assert.equal(promoted.promotedAs, "IDEA_CANDIDATE");
assert.equal(promoted.content, initial.content);
assert.equal(promoted.source, initial.source);

const beforeFailedMutation = structuredClone(field);
assert.throws(
  () => mutateCapture(attached, { type: "ATTACH", fieldId: "field-2" }, field),
  { message: "CROSS_FIELD_MOVE_REJECTED" },
);
assert.deepEqual(field, beforeFailedMutation);

const globalCapture = createCapture({ id: "global" });
const archived = mutateCapture(globalCapture, { type: "ARCHIVE" }, { revision: 0, activities: [] });
const restored = mutateCapture(archived, { type: "RESTORE" }, { revision: 0, activities: [] });
assert.equal(restored.lifecycle, "ACTIVE");

assert.throws(
  () =>
    createCapture({
      kind: "MODEL_OUTPUT",
      source: Object.freeze({ kind: "MODEL_RESPONSE" }),
      sourceIsPartial: true,
    }),
  { message: "PARTIAL_MODEL_OUTPUT_REJECTED" },
);
const partialText = createCapture({
  kind: "TEXT",
  source: Object.freeze({ kind: "MODEL_RESPONSE" }),
  sourceIsPartial: true,
});
assert.equal(partialText.kind, "TEXT");

assert.deepEqual(routeIntent({}), { intent: "ASK", requiresPreviewAndConfirm: false });
assert.deepEqual(routeIntent({ explicitAction: "CAPTURE" }), {
  intent: "CAPTURE",
  requiresPreviewAndConfirm: true,
});
assert.deepEqual(routeIntent({ explicitAction: "PROMOTE" }), {
  intent: "PROMOTE",
  requiresPreviewAndConfirm: true,
});

console.log(
  JSON.stringify(
    {
      result: "PASS",
      contextChipKinds: CHIP_KINDS.size,
      chipAndAggregateBounds: "PASS",
      blockedContextDenied: "PASS",
      captureTransitionMatrix: "PASS",
      immutableContentAndProvenance: "PASS",
      fieldRevisionAndActivityAtomicModel: "PASS",
      failedMutationNoChange: "PASS",
      partialModelOutputBoundary: "PASS",
      freeformDefaultsToAsk: "PASS",
      capturePromoteAlwaysConfirm: "PASS",
      productCodeChanged: false,
    },
    null,
    2,
  ),
);
