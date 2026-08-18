import type {
  ActivityCursor, ArchiveReferenceRequest, AttachReferenceSourceRequest, CreateFieldRequest,
  CreateReferenceRequest, CreateStateRequest, FieldFocusV1, FieldReferenceRequest,
  LineageEndpointRef, ListActivitiesRequest, ListReferencesRequest, ListRelationsRequest,
  ListStatesRequest, ReferenceCursor, ReferenceRequest, RelationCursor,
  RestoreReferenceRequest, RetractReferenceSourceRequest, ReviseReferenceRequest,
  ReviseStateRequest, SaveSurfaceSnapshotRequest, SaveSurfaceSnapshotV1Request,
  SetFieldFocusV1Request, StateCursor, StateReferenceRequest, SupersedeStateRequest,
  SurfaceLayoutV1, TransitionStateRequest, UpdateFieldModeRequest, UpdateFocusRequest,
  CreateProviderConfigRequest, UpdateProviderConfigRequest, ProviderConfigRequest, StoreCredentialRequest,
  StartModelInvocationRequest, CancelModelInvocationRequest, CreateCaptureRequest, CaptureRequest,
  MutateCaptureRequest, AttachCaptureRequest, PromoteCaptureRequest, ListCapturesRequest, ContextChip, CaptureSource,
  CreateProjectRequest, CreateConversationRequest, ConversationRequest, UpdateConversationRequest,
  ArchiveConversationRequest, CreateConversationMessageRequest, ListConversationMessagesRequest,
} from '@fielora/contracts';
import type { BrowserNavigateRequest, BrowserPageRequest, BrowserViewBounds } from './browser-types';
import type {
  ApplyWorkspaceFileRequest, CancelTerminalRequest, PickProjectRequest, RunTerminalRequest,
  WorkspaceFileRequest, WorkspaceProjectRequest,
} from './workspace-types';

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

export function validateBrowserNavigate(value: unknown): BrowserNavigateRequest {
  const input = object(value); exact(input, ['url']);
  if (typeof input.url !== 'string' || input.url.length > 8192) throw new Error('Invalid Browse URL');
  return { url: input.url };
}

export function validateBrowserPageRequest(value: unknown): BrowserPageRequest {
  const input = object(value); exact(input, ['page_id']);
  if (typeof input.page_id !== 'string' || !/^page_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.page_id)) {
    throw new Error('Invalid Browse page ID');
  }
  return { page_id: input.page_id };
}

export function validateBrowserBounds(value: unknown): BrowserViewBounds {
  const input = object(value); exact(input, ['x', 'y', 'width', 'height']);
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const item = input[key];
    if (!Number.isSafeInteger(item) || (item as number) < 0 || (item as number) > 10000) {
      throw new Error('Invalid Browse bounds');
    }
  }
  return input as unknown as BrowserViewBounds;
}

function boundedText(value:unknown,max:number,label:string,allowEmpty=false):string{if(typeof value!=='string'||value.length>max||(!allowEmpty&&!value.trim()))throw new Error(`Invalid ${label}`);return value;}
function boundedUnicodeText(value:unknown,maxScalars:number,maxBytes:number,label:string,allowEmpty=false):string{if(typeof value!=='string'||[...value].length>maxScalars||new TextEncoder().encode(value).byteLength>maxBytes||(!allowEmpty&&!value.trim()))throw new Error(`Invalid ${label}`);return value;}
const PROVIDER_KINDS=new Set(['OPENAI','ANTHROPIC','OPENAI_COMPATIBLE']);
export function validateCreateProvider(value:unknown):CreateProviderConfigRequest{const input=object(value);exact(input,['provider_kind','display_name','base_url','default_model','custom_endpoint_acknowledged']);if(!(input.base_url===null||typeof input.base_url==='string')||typeof input.custom_endpoint_acknowledged!=='boolean')throw new Error('Invalid provider config');return{provider_kind:enumValue(input.provider_kind,PROVIDER_KINDS,'provider kind') as CreateProviderConfigRequest['provider_kind'],display_name:boundedText(input.display_name,120,'display name'),base_url:input.base_url as string|null,default_model:boundedText(input.default_model,256,'model'),custom_endpoint_acknowledged:input.custom_endpoint_acknowledged};}
export function validateUpdateProvider(value:unknown):UpdateProviderConfigRequest{const input=object(value);exact(input,['provider_config_id','expected_revision','display_name','base_url','default_model','custom_endpoint_acknowledged']);if(!(input.base_url===null||typeof input.base_url==='string')||typeof input.custom_endpoint_acknowledged!=='boolean')throw new Error('Invalid provider config');return{provider_config_id:id(input.provider_config_id),expected_revision:revision(input.expected_revision),display_name:boundedText(input.display_name,120,'display name'),base_url:input.base_url as string|null,default_model:boundedText(input.default_model,256,'model'),custom_endpoint_acknowledged:input.custom_endpoint_acknowledged};}
export function validateProviderReference(value:unknown):ProviderConfigRequest{const input=object(value);exact(input,['provider_config_id']);return{provider_config_id:id(input.provider_config_id)};}
export function validateStoreCredential(value:unknown):StoreCredentialRequest{const input=object(value);exact(input,['provider_config_id','secret']);return{provider_config_id:id(input.provider_config_id),secret:boundedUnicodeText(input.secret,2048,2048,'credential')};}
function contextChip(value:unknown):ContextChip{const input=object(value);exact(input,['kind','source_identity','source_revision_or_navigation_generation','display_label','content','sensitivity','completeness']);return{kind:enumValue(input.kind,new Set(['CURRENT_FIELD','CURRENT_FOCUS','CURRENT_PAGE','CURRENT_SELECTION','CAPTURE','USER_NOTE']),'context kind') as ContextChip['kind'],source_identity:boundedText(input.source_identity,256,'context identity'),source_revision_or_navigation_generation:boundedText(input.source_revision_or_navigation_generation,64,'context generation'),display_label:boundedText(input.display_label,160,'context label'),content:boundedUnicodeText(input.content,4000,16*1024,'context content',true),sensitivity:enumValue(input.sensitivity,new Set(['NORMAL','SENSITIVE','BLOCKED']),'sensitivity') as ContextChip['sensitivity'],completeness:enumValue(input.completeness,new Set(['COMPLETE','PARTIAL']),'completeness') as ContextChip['completeness']};}
export function validateStartModel(value:unknown):StartModelInvocationRequest{const input=object(value);exact(input,['provider_config_id','model_id','intent','user_input','context_package','response_mode']);if(!(input.model_id===null||typeof input.model_id==='string')||!Array.isArray(input.context_package)||input.context_package.length>8||input.response_mode!=='TEXT')throw new Error('Invalid model invocation');const chips=input.context_package.map(contextChip);const totalScalars=chips.reduce((total,chip)=>total+[...chip.content].length,0);const totalBytes=chips.reduce((total,chip)=>total+new TextEncoder().encode(chip.content).byteLength,0);if(totalScalars>12000||totalBytes>48*1024)throw new Error('Invalid context package');return{provider_config_id:id(input.provider_config_id),model_id:input.model_id===null?null:boundedUnicodeText(input.model_id,256,1024,'model'),intent:enumValue(input.intent,new Set(['ASK','CONTINUE']),'intent') as StartModelInvocationRequest['intent'],user_input:boundedUnicodeText(input.user_input,8000,32*1024,'user input'),context_package:chips,response_mode:'TEXT'};}
export function validateCancelModel(value:unknown):CancelModelInvocationRequest{const input=object(value);exact(input,['invocation_id']);return{invocation_id:id(input.invocation_id)};}
function captureSource(value:unknown):CaptureSource{const input=object(value);exact(input,['kind','title','uri','field_id','resource_type','resource_id','resource_revision','provider_config_id','provider_model_id','provider_invocation_id','is_partial']);for(const key of ['title','uri','field_id','resource_type','resource_id','provider_config_id','provider_model_id','provider_invocation_id'] as const){if(!(input[key]===null||typeof input[key]==='string'))throw new Error('Invalid capture source');}if(typeof input.uri==='string'&&new TextEncoder().encode(input.uri).byteLength>2048)throw new Error('Invalid capture source URI');if(!(input.resource_revision===null||Number.isSafeInteger(input.resource_revision))||typeof input.is_partial!=='boolean')throw new Error('Invalid capture source');return input as unknown as CaptureSource;}
export function validateCreateCapture(value:unknown):CreateCaptureRequest{const input=object(value);exact(input,['kind','title','content','source']);return{kind:enumValue(input.kind,new Set(['TEXT','PAGE','SELECTION','MODEL_OUTPUT','FIELD_EXCERPT']),'capture kind') as CreateCaptureRequest['kind'],title:boundedUnicodeText(input.title,120,480,'capture title'),content:boundedUnicodeText(input.content,16000,64*1024,'capture content'),source:captureSource(input.source)};}
export function validateCaptureReference(value:unknown):CaptureRequest{const input=object(value);exact(input,['capture_id']);return{capture_id:id(input.capture_id)};}
export function validateMutateCapture(value:unknown):MutateCaptureRequest{const input=object(value);exact(input,['capture_id','expected_revision']);return{capture_id:id(input.capture_id),expected_revision:revision(input.expected_revision)};}
export function validateAttachCapture(value:unknown):AttachCaptureRequest{const input=object(value);exact(input,['capture_id','field_id','expected_revision']);return{capture_id:id(input.capture_id),field_id:id(input.field_id),expected_revision:revision(input.expected_revision)};}
export function validatePromoteCapture(value:unknown):PromoteCaptureRequest{const input=object(value);exact(input,['capture_id','field_id','expected_revision']);return{capture_id:id(input.capture_id),field_id:input.field_id===null?null:id(input.field_id),expected_revision:revision(input.expected_revision)};}
export function validateListCaptures(value:unknown):ListCapturesRequest{const input=object(value);exact(input,['placement','lifecycle','field_id','cursor','limit']);if(!(input.placement===null||['INBOX','ATTACHED','PROMOTED'].includes(String(input.placement)))||!(input.lifecycle===null||['ACTIVE','ARCHIVED'].includes(String(input.lifecycle))))throw new Error('Invalid capture filter');let cursor=null;if(input.cursor!==null){const item=object(input.cursor);exact(item,['updated_at','capture_id']);if(!Number.isSafeInteger(item.updated_at))throw new Error('Invalid capture cursor');cursor={updated_at:item.updated_at as number,capture_id:id(item.capture_id)};}return{placement:input.placement as ListCapturesRequest['placement'],lifecycle:input.lifecycle as ListCapturesRequest['lifecycle'],field_id:input.field_id===null?null:id(input.field_id),cursor,limit:limit(input.limit)};}

export function validatePickProject(value: unknown): PickProjectRequest {
  const input=object(value); exact(input,['title','goal']);
  if(!(input.goal===null||typeof input.goal==='string'))throw new Error('Invalid Project goal');
  return{title:boundedUnicodeText(input.title,120,480,'Project title',true),goal:input.goal as string|null};
}
export function validateCreateProject(value: unknown): CreateProjectRequest {
  const input=object(value); exact(input,['title','goal','root_path']);
  const picked=validatePickProject({title:input.title,goal:input.goal});
  return{...picked,title:boundedUnicodeText(picked.title,120,480,'Project title'),root_path:boundedUnicodeText(input.root_path,32767,32767,'Project root')};
}
export const validateWorkspaceProject=(value:unknown):WorkspaceProjectRequest=>validateReference(value);
function conversationFields(input:Record<string,unknown>):{title:string;provider_config_id:string|null;model_id:string|null}{
  if(!(input.provider_config_id===null||typeof input.provider_config_id==='string')||!(input.model_id===null||typeof input.model_id==='string'))throw new Error('Invalid Conversation selection');
  return{title:boundedUnicodeText(input.title,120,480,'Conversation title'),provider_config_id:input.provider_config_id===null?null:id(input.provider_config_id),model_id:input.model_id===null?null:boundedUnicodeText(input.model_id,256,1024,'model')};
}
export function validateCreateConversation(value:unknown):CreateConversationRequest{const input=object(value);exact(input,['field_id','title','provider_config_id','model_id']);return{field_id:id(input.field_id),...conversationFields(input)};}
export function validateConversationReference(value:unknown):ConversationRequest{const input=object(value);exact(input,['conversation_id']);return{conversation_id:id(input.conversation_id)};}
export function validateUpdateConversation(value:unknown):UpdateConversationRequest{const input=object(value);exact(input,['conversation_id','expected_revision','title','provider_config_id','model_id']);return{conversation_id:id(input.conversation_id),expected_revision:revision(input.expected_revision),...conversationFields(input)};}
export function validateArchiveConversation(value:unknown):ArchiveConversationRequest{const input=object(value);exact(input,['conversation_id','expected_revision']);return{conversation_id:id(input.conversation_id),expected_revision:revision(input.expected_revision)};}
export function validateCreateConversationMessage(value:unknown):CreateConversationMessageRequest{const input=object(value);exact(input,['conversation_id','role','content','status','provider_config_id','model_id','invocation_id']);if(!(input.provider_config_id===null||typeof input.provider_config_id==='string')||!(input.model_id===null||typeof input.model_id==='string')||!(input.invocation_id===null||typeof input.invocation_id==='string'))throw new Error('Invalid message provenance');return{conversation_id:id(input.conversation_id),role:enumValue(input.role,new Set(['USER','ASSISTANT']),'message role') as CreateConversationMessageRequest['role'],content:boundedUnicodeText(input.content,1048576,1048576,'message'),status:enumValue(input.status,new Set(['COMPLETED','CANCELLED','FAILED']),'message status') as CreateConversationMessageRequest['status'],provider_config_id:input.provider_config_id===null?null:id(input.provider_config_id),model_id:input.model_id===null?null:boundedUnicodeText(input.model_id,256,1024,'model'),invocation_id:input.invocation_id===null?null:id(input.invocation_id)};}
export function validateListConversationMessages(value:unknown):ListConversationMessagesRequest{const input=object(value);exact(input,['conversation_id']);return{conversation_id:id(input.conversation_id)};}
function relativePath(value:unknown):string{const result=boundedUnicodeText(value,4096,16384,'relative path');if(/^(?:[a-zA-Z]:|[\\/])/.test(result)||result.replaceAll('\\','/').split('/').some((part)=>part===''||part==='..'))throw new Error('Invalid relative path');return result.replaceAll('\\','/');}
export function validateWorkspaceFile(value:unknown):WorkspaceFileRequest{const input=object(value);exact(input,['field_id','relative_path']);return{field_id:id(input.field_id),relative_path:relativePath(input.relative_path)};}
export function validateApplyWorkspaceFile(value:unknown):ApplyWorkspaceFileRequest{const input=object(value);exact(input,['field_id','relative_path','expected_sha256','content']);if(typeof input.expected_sha256!=='string'||!/^[0-9a-f]{64}$/.test(input.expected_sha256))throw new Error('Invalid file hash');return{field_id:id(input.field_id),relative_path:relativePath(input.relative_path),expected_sha256:input.expected_sha256,content:boundedUnicodeText(input.content,1048576,1048576,'file content',true)};}
export function validateRunTerminal(value:unknown):RunTerminalRequest{const input=object(value);exact(input,['field_id','command']);return{field_id:id(input.field_id),command:boundedUnicodeText(input.command,8000,32000,'terminal command')};}
export function validateCancelTerminal(value:unknown):CancelTerminalRequest{const input=object(value);exact(input,['run_id']);if(typeof input.run_id!=='string'||!/^run_[0-9a-f-]{36}$/.test(input.run_id))throw new Error('Invalid terminal run');return{run_id:input.run_id};}
