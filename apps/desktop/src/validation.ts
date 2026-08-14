import type {
  CreateFieldRequest,
  FieldReferenceRequest,
  SaveSurfaceSnapshotRequest,
  UpdateFocusRequest,
} from '@fielora/contracts';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid bridge payload');
  }
  return value as Record<string, unknown>;
}

export function validateCreate(value: unknown): CreateFieldRequest {
  const input = object(value);
  if (typeof input.title !== 'string' || !(typeof input.goal === 'string' || input.goal === null)) {
    throw new Error('Invalid create Field payload');
  }
  return { title: input.title, goal: input.goal };
}

export function validateReference(value: unknown): FieldReferenceRequest {
  const input = object(value);
  if (typeof input.field_id !== 'string' || !UUID_V7.test(input.field_id)) {
    throw new Error('Invalid Field reference');
  }
  return { field_id: input.field_id };
}

export function validateFocus(value: unknown): UpdateFocusRequest {
  const input = object(value);
  const reference = validateReference(input);
  if (!Number.isSafeInteger(input.expected_revision) || (input.expected_revision as number) < 1) {
    throw new Error('Invalid expected revision');
  }
  return {
    ...reference,
    expected_revision: input.expected_revision as number,
    focus: input.focus,
  };
}

export function validateSnapshot(value: unknown): SaveSurfaceSnapshotRequest {
  const input = object(value);
  const reference = validateReference(input);
  if (!Array.isArray(input.open_objects) || !input.open_objects.every((id) => typeof id === 'string' && UUID_V7.test(id))) {
    throw new Error('Invalid open objects');
  }
  return {
    ...reference,
    layout: input.layout,
    open_objects: input.open_objects as string[],
  };
}
