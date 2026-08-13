import type {
  CreateFieldRequest,
  DomainEventDTO,
  FieldReferenceRequest,
  FieldSummary,
  FieldView,
  HealthDTO,
  SaveSurfaceSnapshotRequest,
  SurfaceResumeView,
  SurfaceSnapshotView,
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
  };
  surface: {
    saveSnapshot(request: SaveSurfaceSnapshotRequest): Promise<SurfaceSnapshotView>;
    latestSnapshot(request: FieldReferenceRequest): Promise<SurfaceResumeView>;
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
