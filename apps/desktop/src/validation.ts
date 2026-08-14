import type {
  ActivityCursor, ArchiveReferenceRequest, AttachReferenceSourceRequest, CreateFieldRequest,
  CreateReferenceRequest, CreateStateRequest, FieldFocusV1, FieldReferenceRequest,
  LineageEndpointRef, ListActivitiesRequest, ListReferencesRequest, ListRelationsRequest,
  ListStatesRequest, ReferenceCursor, ReferenceRequest, RelationCursor,
  RestoreReferenceRequest, RetractReferenceSourceRequest, ReviseReferenceRequest,
  ReviseStateRequest, SaveSurfaceSnapshotRequest, SaveSurfaceSnapshotV1Request,
  SetFieldFocusV1Request, StateCursor, StateReferenceRequest, SupersedeStateRequest,
  SurfaceLayoutV1, TransitionStateRequest, UpdateFieldModeRequest, UpdateFocusRequest,
} from '@fielora/contracts';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STATE_KINDS = new Set(['FACT', 'DECISION', 'ASSUMPTION', 'QUESTION', 'TASK', 'BLOCKER', 'RESULT']);
const STATE_STATUSES = new Set(['ACTIVE', 'RESOLVED', 'SUPERSEDED', 'RETRACTED']);
const MODES = new Set(['EXPLORE', 'THINK', 'BUILD', 'OPERATE', 'VERIFY']);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid bridge payload');
  return value as Record<string, unknown>;
}
function exact(input: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(input).some((key) => !keys.includes(key))) throw new Error('Unexpected bridge payload field');
}
function id(value: unknown, label = 'id'): string {
  if (typeof value !== 'string' || !UUID_V7.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error('Invalid expected revision');
  return value as number;
}
function nullable<T>(value: unknown, parse: (input: unknown) => T): T | null { return value === null ? null : parse(value); }
function limit(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) throw new Error('Invalid limit');
  return value as number;
}
function finiteConfidence(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid confidence');
  return value;
}
function enumValue(value: unknown, allowed: Set<string>, label: string): string {
  if (typeof value !== 'string' || !allowed.has(value)) throw new Error(`Invalid ${label}`);
  return value;
}

export function validateCreate(value: unknown): CreateFieldRequest {
  const input = object(value); exact(input, ['title', 'goal']);
  if (typeof input.title !== 'string' || !(typeof input.goal === 'string' || input.goal === null)) throw new Error('Invalid create Field payload');
  return { title: input.title, goal: input.goal };
}
export function validateReference(value: unknown): FieldReferenceRequest {
  const input = object(value); exact(input, ['field_id']); return { field_id: id(input.field_id, 'Field reference') };
}
export function validateFocus(value: unknown): UpdateFocusRequest {
  const input = object(value); exact(input, ['field_id', 'expected_revision', 'focus']);
  if (typeof input.focus !== 'string' || input.focus.trim().length < 1 || [...input.focus.trim()].length > 120) throw new Error('Invalid legacy focus');
  return { field_id: id(input.field_id), expected_revision: revision(input.expected_revision), focus: input.focus };
}
function fieldFocus(value: unknown): FieldFocusV1 {
  const input = object(value);
  if (input.kind === 'STATE') { exact(input, ['kind', 'state_id']); return { kind: 'STATE', state_id: id(input.state_id) }; }
  if (input.kind === 'REFERENCE') { exact(input, ['kind', 'object_id']); return { kind: 'REFERENCE', object_id: id(input.object_id) }; }
  throw new Error('Invalid typed focus');
}
export function validateSetFocusV1(value: unknown): SetFieldFocusV1Request {
  const input = object(value); exact(input, ['field_id', 'expected_field_revision', 'focus']);
  return { field_id: id(input.field_id), expected_field_revision: revision(input.expected_field_revision), focus: nullable(input.focus, fieldFocus) };
}
export function validateUpdateMode(value: unknown): UpdateFieldModeRequest {
  const input = object(value); exact(input, ['field_id', 'expected_field_revision', 'mode']);
  return { field_id: id(input.field_id), expected_field_revision: revision(input.expected_field_revision), mode: input.mode === null ? null : enumValue(input.mode, MODES, 'mode') as UpdateFieldModeRequest['mode'] };
}

export function validateCreateState(value: unknown): CreateStateRequest {
  const input=object(value); exact(input,['field_id','kind','content','confidence']);
  if(typeof input.content!=='string')throw new Error('Invalid state content');
  return{field_id:id(input.field_id),kind:enumValue(input.kind,STATE_KINDS,'state kind') as CreateStateRequest['kind'],content:input.content,confidence:finiteConfidence(input.confidence)};
}
export function validateStateReference(value: unknown): StateReferenceRequest { const input=object(value);exact(input,['field_id','state_id']);return{field_id:id(input.field_id),state_id:id(input.state_id)}; }
function stateCursor(value:unknown):StateCursor{const input=object(value);exact(input,['updated_at','state_id']);if(!Number.isSafeInteger(input.updated_at))throw new Error('Invalid cursor');return{updated_at:input.updated_at as number,state_id:id(input.state_id)};}
export function validateListStates(value:unknown):ListStatesRequest{const input=object(value);exact(input,['field_id','kind','status','cursor','limit']);return{field_id:id(input.field_id),kind:input.kind===null?null:enumValue(input.kind,STATE_KINDS,'state kind') as ListStatesRequest['kind'],status:input.status===null?null:enumValue(input.status,STATE_STATUSES,'state status') as ListStatesRequest['status'],cursor:nullable(input.cursor,stateCursor),limit:limit(input.limit)};}
export function validateReviseState(value:unknown):ReviseStateRequest{const input=object(value);exact(input,['field_id','state_id','expected_state_revision','content','confidence']);if(typeof input.content!=='string')throw new Error('Invalid state content');return{field_id:id(input.field_id),state_id:id(input.state_id),expected_state_revision:revision(input.expected_state_revision),content:input.content,confidence:finiteConfidence(input.confidence)};}
export function validateTransitionState(value:unknown):TransitionStateRequest{const input=object(value);exact(input,['field_id','state_id','expected_state_revision','target']);return{field_id:id(input.field_id),state_id:id(input.state_id),expected_state_revision:revision(input.expected_state_revision),target:enumValue(input.target,new Set(['ACTIVE','RESOLVED','RETRACTED']),'transition') as TransitionStateRequest['target']};}
export function validateSupersedeState(value:unknown):SupersedeStateRequest{const input=object(value);exact(input,['field_id','state_id','expected_state_revision','replacement_content','replacement_confidence']);if(typeof input.replacement_content!=='string')throw new Error('Invalid replacement');return{field_id:id(input.field_id),state_id:id(input.state_id),expected_state_revision:revision(input.expected_state_revision),replacement_content:input.replacement_content,replacement_confidence:finiteConfidence(input.replacement_confidence)};}

export function validateCreateReference(value:unknown):CreateReferenceRequest{const input=object(value);exact(input,['field_id','title','url']);if(typeof input.title!=='string'||typeof input.url!=='string')throw new Error('Invalid reference');return{field_id:id(input.field_id),title:input.title,url:input.url};}
export function validateObjectReference(value:unknown):ReferenceRequest{const input=object(value);exact(input,['field_id','object_id']);return{field_id:id(input.field_id),object_id:id(input.object_id)};}
function referenceCursor(value:unknown):ReferenceCursor{const input=object(value);exact(input,['updated_at','object_id']);if(!Number.isSafeInteger(input.updated_at))throw new Error('Invalid cursor');return{updated_at:input.updated_at as number,object_id:id(input.object_id)};}
export function validateListReferences(value:unknown):ListReferencesRequest{const input=object(value);exact(input,['field_id','lifecycle','cursor','limit']);if(!(input.lifecycle===null||input.lifecycle==='ACTIVE'||input.lifecycle==='ARCHIVED'))throw new Error('Invalid lifecycle');return{field_id:id(input.field_id),lifecycle:input.lifecycle,cursor:nullable(input.cursor,referenceCursor),limit:limit(input.limit)};}
export function validateReviseReference(value:unknown):ReviseReferenceRequest{const input=object(value);exact(input,['field_id','object_id','expected_object_revision','title','url']);if(typeof input.title!=='string'||typeof input.url!=='string')throw new Error('Invalid reference');return{field_id:id(input.field_id),object_id:id(input.object_id),expected_object_revision:revision(input.expected_object_revision),title:input.title,url:input.url};}
export function validateArchiveReference(value:unknown):ArchiveReferenceRequest{const input=object(value);exact(input,['field_id','object_id','expected_object_revision']);return{field_id:id(input.field_id),object_id:id(input.object_id),expected_object_revision:revision(input.expected_object_revision)};}
export const validateRestoreReference=(value:unknown):RestoreReferenceRequest=>validateArchiveReference(value);

export function validateAttachReferenceSource(value:unknown):AttachReferenceSourceRequest{const input=object(value);exact(input,['field_id','state_id','reference_id']);return{field_id:id(input.field_id),state_id:id(input.state_id),reference_id:id(input.reference_id)};}
export function validateRetractReferenceSource(value:unknown):RetractReferenceSourceRequest{const input=object(value);exact(input,['field_id','relation_id','expected_relation_revision']);return{field_id:id(input.field_id),relation_id:id(input.relation_id),expected_relation_revision:revision(input.expected_relation_revision)};}
function endpoint(value:unknown):LineageEndpointRef{const input=object(value);if(input.kind==='STATE'){exact(input,['kind','state_id']);return{kind:'STATE',state_id:id(input.state_id)};}if(input.kind==='REFERENCE'){exact(input,['kind','object_id']);return{kind:'REFERENCE',object_id:id(input.object_id)};}throw new Error('Invalid endpoint');}
function relationCursor(value:unknown):RelationCursor{const input=object(value);exact(input,['created_at','relation_id']);if(!Number.isSafeInteger(input.created_at))throw new Error('Invalid cursor');return{created_at:input.created_at as number,relation_id:id(input.relation_id)};}
export function validateListRelations(value:unknown):ListRelationsRequest{const input=object(value);exact(input,['field_id','relation_type','lifecycle','endpoint','cursor','limit']);if(!(input.relation_type===null||input.relation_type==='SOURCED_FROM'||input.relation_type==='SUPERSEDED_BY'))throw new Error('Invalid relation type');if(!(input.lifecycle===null||input.lifecycle==='ACTIVE'||input.lifecycle==='RETRACTED'))throw new Error('Invalid relation lifecycle');return{field_id:id(input.field_id),relation_type:input.relation_type,lifecycle:input.lifecycle,endpoint:nullable(input.endpoint,endpoint),cursor:nullable(input.cursor,relationCursor),limit:limit(input.limit)};}
function activityCursor(value:unknown):ActivityCursor{const input=object(value);exact(input,['created_at','activity_id']);if(!Number.isSafeInteger(input.created_at))throw new Error('Invalid cursor');return{created_at:input.created_at as number,activity_id:id(input.activity_id)};}
export function validateListActivities(value:unknown):ListActivitiesRequest{const input=object(value);exact(input,['field_id','cursor','limit']);return{field_id:id(input.field_id),cursor:nullable(input.cursor,activityCursor),limit:limit(input.limit)};}

export function validateSnapshot(value: unknown): SaveSurfaceSnapshotRequest { const input=object(value);exact(input,['field_id','layout','open_objects']);if(!Array.isArray(input.open_objects)||!input.open_objects.every((item)=>typeof item==='string'&&UUID_V7.test(item)))throw new Error('Invalid open objects');return{field_id:id(input.field_id),layout:input.layout,open_objects:input.open_objects as string[]}; }
function surfaceLayout(value:unknown):SurfaceLayoutV1{const input=object(value);exact(input,['version','template','primary','supporting','focused_pane_id']);if(input.version!==1||!['PRIMARY_ONLY','PRIMARY_SUPPORT_RIGHT','PRIMARY_TWO_SUPPORTS_RIGHT'].includes(String(input.template))||!Array.isArray(input.supporting)||typeof input.focused_pane_id!=='string')throw new Error('Invalid surface layout');const pane=(value:unknown)=>{const item=object(value);exact(item,['pane_id','primitive','binding','collapsed']);if(typeof item.pane_id!=='string'||!['TASK_PANE','REFERENCE_PANE'].includes(String(item.primitive))||typeof item.collapsed!=='boolean')throw new Error('Invalid pane');const binding=object(item.binding);if(binding.kind==='FIELD_TASKS')exact(binding,['kind']);else if(binding.kind==='REFERENCE'){exact(binding,['kind','object_id']);id(binding.object_id);}else throw new Error('Invalid pane binding');return item as unknown as SurfaceLayoutV1['primary'];};return{version:1,template:input.template as SurfaceLayoutV1['template'],primary:pane(input.primary),supporting:input.supporting.map(pane),focused_pane_id:input.focused_pane_id};}
export function validateSnapshotV1(value:unknown):SaveSurfaceSnapshotV1Request{const input=object(value);exact(input,['field_id','layout']);return{field_id:id(input.field_id),layout:surfaceLayout(input.layout)};}
