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
} from '@fielora/contracts';

export type Unsubscribe = () => void;
export type DesktopCoreEvent = DomainEventDTO | {
  event: 'event.core.health';
  state: HealthDTO['state'];
  error?: string;
};

export interface FieloraBridge {
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
  core: {
    getHealth(): Promise<HealthDTO>;
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
    };
  }
}
