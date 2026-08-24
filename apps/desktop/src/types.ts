import type {
  ActivityCursor, ActivityView, ArchiveReferenceRequest, AttachReferenceSourceRequest,
  CreateFieldRequest,
  CreateReferenceRequest, CreateStateRequest,
  DomainEventDTO,
  FieldResumeV1View,
  FieldReferenceRequest,
  FieldSummary,
  FieldView,
  HealthDTO,
  ListActivitiesRequest, ListReferencesRequest, ListRelationsRequest, ListStatesRequest,
  Page, RealityMutationResult, ReferenceCursor, ReferenceRequest, ReferenceView,
  RelationCursor, RelationView, RestoreReferenceRequest, RetractReferenceSourceRequest,
  ReviseReferenceRequest, ReviseStateRequest,
  SaveSurfaceSnapshotV1Request,
  SaveSurfaceSnapshotRequest,
  SetFieldFocusV1Request, StateCursor, StateReferenceRequest, StateView, SupersedeStateRequest,
  SupersedeStateResult,
  SurfaceResumeView,
  SurfaceSnapshotV1View,
  SurfaceSnapshotView,
  TransitionStateRequest, UpdateFieldModeRequest,
  UpdateFocusRequest,
  CreateProviderConfigRequest, UpdateProviderConfigRequest, ProviderConfigRequest, StoreCredentialRequest,
  ProviderConfigView, StartModelInvocationRequest, StartModelInvocationResult, CancelModelInvocationRequest,
  ModelInvocationEvent, CaptureChangedEvent, CreateCaptureRequest, CaptureRequest, MutateCaptureRequest,
  AttachCaptureRequest, PromoteCaptureRequest, ListCapturesRequest, CaptureView, CaptureCursor,
  ProjectView, ProjectRequest, CreateProjectRequest, UpdateProjectRequest, ArchiveProjectRequest,
  ConversationView, CreateConversationRequest, ConversationRequest, UpdateConversationRequest,
  ArchiveConversationRequest, ConversationMessageView, CreateConversationMessageRequest,
  ListConversationMessagesRequest,
  AgentChangedEvent, AgentRunView, StartAgentRunRequest, AgentRunRequest, ListAgentRunsRequest,
  AgentEventView, ListAgentEventsRequest, AgentToolCallView, ApprovalView, ResolveAgentApprovalRequest,
  BuildProvenanceView,
} from '@fielora/contracts';
import type { BrowserContextCandidate, BrowserNavigateRequest, BrowserPageRequest, BrowserPageState, BrowserViewBounds } from './browser-types';
import type {
  ApplyWorkspaceFileRequest, CancelTerminalRequest, PickProjectRequest, RunTerminalRequest,
  TerminalEvent, TerminalRunResult, WorkspaceFileEntry, WorkspaceFileRequest, WorkspaceFileView, WorkspaceImagePreview,
  OpenWorkspaceProjectRequest, WorkspaceProjectOpenTargetView,
  CopyWorkspaceAttachmentResult, ReadWorkspaceAttachmentRequest, SaveWorkspaceAttachmentRequest, SaveWorkspaceAttachmentResult, StoreWorkspaceAttachmentRequest,
  WorkspaceAttachmentSelection, WorkspaceAttachmentView, WorkspaceEnvironmentView, WorkspaceProjectRequest,
} from './workspace-types';

export type Unsubscribe = () => void;
export type AgentTextDeltaEvent = {
  event: 'event.agent.text_delta';
  run_id: string;
  step: number;
  text_delta: string;
};
export type DesktopCoreEvent = DomainEventDTO | ModelInvocationEvent | CaptureChangedEvent | AgentChangedEvent | AgentTextDeltaEvent | {
  event: 'event.core.health';
  state: HealthDTO['state'];
  error?: string;
};

export interface FieloraBridge {
  window: {
    setTitlebarTheme(theme: 'LIGHT' | 'DARK'): Promise<null>;
  };
  project: {
    pick(request: PickProjectRequest): Promise<ProjectView | null>;
    list(): Promise<ProjectView[]>;
    get(request: ProjectRequest): Promise<ProjectView>;
    update(request: UpdateProjectRequest): Promise<ProjectView>;
    archive(request: ArchiveProjectRequest): Promise<ProjectView>;
  };
  conversation: {
    create(request: CreateConversationRequest): Promise<ConversationView>;
    list(request: ProjectRequest): Promise<ConversationView[]>;
    get(request: ConversationRequest): Promise<ConversationView>;
    update(request: UpdateConversationRequest): Promise<ConversationView>;
    archive(request: ArchiveConversationRequest): Promise<ConversationView>;
    createMessage(request: CreateConversationMessageRequest): Promise<ConversationMessageView>;
    listMessages(request: ListConversationMessagesRequest): Promise<ConversationMessageView[]>;
  };
  workspace: {
    listFiles(request: WorkspaceProjectRequest): Promise<WorkspaceFileEntry[]>;
    readFile(request: WorkspaceFileRequest): Promise<WorkspaceFileView>;
    previewFile(request: WorkspaceFileRequest): Promise<WorkspaceImagePreview>;
    applyFile(request: ApplyWorkspaceFileRequest): Promise<WorkspaceFileView>;
    getEnvironment(request: WorkspaceProjectRequest): Promise<WorkspaceEnvironmentView>;
    getOpenTargets(request: WorkspaceProjectRequest): Promise<WorkspaceProjectOpenTargetView[]>;
    openProject(request: OpenWorkspaceProjectRequest): Promise<null>;
    pickAttachments(): Promise<WorkspaceAttachmentSelection>;
    storeAttachment(request: StoreWorkspaceAttachmentRequest): Promise<WorkspaceAttachmentView>;
    readAttachment(request: ReadWorkspaceAttachmentRequest): Promise<{ data_url: string; mime_type: string }>;
    copyAttachment(request: ReadWorkspaceAttachmentRequest): Promise<CopyWorkspaceAttachmentResult>;
    saveAttachment(request: SaveWorkspaceAttachmentRequest): Promise<SaveWorkspaceAttachmentResult>;
    runTerminal(request: RunTerminalRequest): Promise<TerminalRunResult>;
    cancelTerminal(request: CancelTerminalRequest): Promise<null>;
    subscribe(listener: (event: TerminalEvent) => void): Unsubscribe;
  };
  field: {
    create(request: CreateFieldRequest): Promise<FieldView>;
    list(): Promise<FieldSummary[]>;
    get(request: FieldReferenceRequest): Promise<FieldView>;
    updateFocus(request: UpdateFocusRequest): Promise<FieldView>;
    updateMode(request: UpdateFieldModeRequest): Promise<RealityMutationResult<FieldView>>;
    setFocusV1(request: SetFieldFocusV1Request): Promise<RealityMutationResult<FieldView>>;
    resumeV1(request: FieldReferenceRequest): Promise<FieldResumeV1View>;
  };
  state: {
    create(request: CreateStateRequest): Promise<RealityMutationResult<StateView>>;
    get(request: StateReferenceRequest): Promise<StateView>;
    list(request: ListStatesRequest): Promise<Page<StateView, StateCursor>>;
    revise(request: ReviseStateRequest): Promise<RealityMutationResult<StateView>>;
    transition(request: TransitionStateRequest): Promise<RealityMutationResult<StateView>>;
    supersede(request: SupersedeStateRequest): Promise<SupersedeStateResult>;
  };
  reference: {
    create(request: CreateReferenceRequest): Promise<RealityMutationResult<ReferenceView>>;
    get(request: ReferenceRequest): Promise<ReferenceView>;
    list(request: ListReferencesRequest): Promise<Page<ReferenceView, ReferenceCursor>>;
    revise(request: ReviseReferenceRequest): Promise<RealityMutationResult<ReferenceView>>;
    archive(request: ArchiveReferenceRequest): Promise<RealityMutationResult<ReferenceView>>;
    restore(request: RestoreReferenceRequest): Promise<RealityMutationResult<ReferenceView>>;
  };
  relation: {
    attachReferenceSource(request: AttachReferenceSourceRequest): Promise<RealityMutationResult<RelationView>>;
    retractReferenceSource(request: RetractReferenceSourceRequest): Promise<RealityMutationResult<RelationView>>;
    list(request: ListRelationsRequest): Promise<Page<RelationView, RelationCursor>>;
  };
  activity: {
    list(request: ListActivitiesRequest): Promise<Page<ActivityView, ActivityCursor>>;
  };
  surface: {
    saveSnapshot(request: SaveSurfaceSnapshotRequest): Promise<SurfaceSnapshotView>;
    latestSnapshot(request: FieldReferenceRequest): Promise<SurfaceResumeView>;
    saveSnapshotV1(request: SaveSurfaceSnapshotV1Request): Promise<SurfaceSnapshotV1View>;
  };
  browser: {
    show(bounds: BrowserViewBounds): Promise<BrowserPageState>;
    hide(): Promise<BrowserPageState>;
    createPage(): Promise<BrowserPageState>;
    switchPage(request: BrowserPageRequest): Promise<BrowserPageState>;
    closePage(request: BrowserPageRequest): Promise<BrowserPageState>;
    showPageContextMenu(request: BrowserPageRequest): Promise<BrowserPageState>;
    navigate(request: BrowserNavigateRequest): Promise<BrowserPageState>;
    back(): Promise<BrowserPageState>;
    forward(): Promise<BrowserPageState>;
    reload(): Promise<BrowserPageState>;
    getState(): Promise<BrowserPageState>;
    getContextCandidate(): Promise<BrowserContextCandidate>;
    subscribe(listener: (state: BrowserPageState) => void): Unsubscribe;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
  };
  provider: {
    create(request: CreateProviderConfigRequest): Promise<ProviderConfigView>;
    update(request: UpdateProviderConfigRequest): Promise<ProviderConfigView>;
    storeCredential(request: StoreCredentialRequest): Promise<ProviderConfigView>;
    deleteCredential(request: ProviderConfigRequest): Promise<ProviderConfigView>;
    remove(request: ProviderConfigRequest): Promise<ProviderConfigView>;
    probe(request: ProviderConfigRequest): Promise<StartModelInvocationResult>;
    list(): Promise<ProviderConfigView[]>;
    get(request: ProviderConfigRequest): Promise<ProviderConfigView>;
  };
  model: {
    start(request: StartModelInvocationRequest): Promise<StartModelInvocationResult>;
    cancel(request: CancelModelInvocationRequest): Promise<null>;
  };
  agent: {
    start(request: StartAgentRunRequest): Promise<AgentRunView>;
    get(request: AgentRunRequest): Promise<AgentRunView>;
    list(request: ListAgentRunsRequest): Promise<AgentRunView[]>;
    events(request: ListAgentEventsRequest): Promise<AgentEventView[]>;
    toolCalls(request: AgentRunRequest): Promise<AgentToolCallView[]>;
    cancel(request: AgentRunRequest): Promise<AgentRunView>;
    pause(request: AgentRunRequest): Promise<AgentRunView>;
    resume(request: AgentRunRequest): Promise<AgentRunView>;
    resolveApproval(request: ResolveAgentApprovalRequest): Promise<ApprovalView>;
  };
  capture: {
    create(request: CreateCaptureRequest): Promise<CaptureView>;
    attach(request: AttachCaptureRequest): Promise<CaptureView>;
    promote(request: PromoteCaptureRequest): Promise<CaptureView>;
    archive(request: MutateCaptureRequest): Promise<CaptureView>;
    restore(request: MutateCaptureRequest): Promise<CaptureView>;
    list(request: ListCapturesRequest): Promise<Page<CaptureView, CaptureCursor>>;
    get(request: CaptureRequest): Promise<CaptureView>;
  };
  core: {
    getHealth(): Promise<HealthDTO>;
    getBuildProvenance(): Promise<BuildProvenanceView>;
    subscribe(listener: (event: DesktopCoreEvent) => void): Unsubscribe;
    retry(): Promise<void>;
    openLogs(): Promise<void>;
    quit(): Promise<void>;
  };
}

declare global {
  interface Window {
    fielora: FieloraBridge;
    fieloraTest?: {
      killCore(): Promise<void>;
      resizeWindow(size: { width: number; height: number }): Promise<{ width: number; height: number }>;
      createProject(request: CreateProjectRequest): Promise<ProjectView>;
    };
  }
}
