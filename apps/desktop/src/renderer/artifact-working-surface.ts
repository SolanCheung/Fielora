import type {
  ActiveArtifactContext, ArtifactHistoryView, ArtifactReadView, ArtifactType,
  SpreadsheetCellV1, SpreadsheetSheetId,
} from '@fielora/contracts';

export type ArtifactViewMode = 'CURRENT' | 'HISTORICAL';

export interface ArtifactSurfaceSession {
  artifactId: string;
  read: ArtifactReadView | null;
  history: ArtifactHistoryView | null;
  mode: ArtifactViewMode;
  viewedRevisionId: string | null;
  loading: boolean;
  error: string;
  newRevisionAvailable: boolean;
  selectedSlide: number | null;
  selectedSheetId: string | null;
}

export function emptyArtifactSession(artifactId: string): ArtifactSurfaceSession {
  return {
    artifactId,
    read: null,
    history: null,
    mode: 'CURRENT',
    viewedRevisionId: null,
    loading: true,
    error: '',
    newRevisionAvailable: false,
    selectedSlide: null,
    selectedSheetId: null,
  };
}

export function artifactTabId(artifactId: string): string {
  return `artifact:${artifactId}`;
}

export function pinArtifactRevision(
  session: ArtifactSurfaceSession,
  read: ArtifactReadView,
  history: ArtifactHistoryView,
): ArtifactSurfaceSession {
  const isCurrent = read.revision.revision_id === read.artifact.current_revision_id;
  return {
    ...session,
    read,
    history,
    mode: isCurrent ? 'CURRENT' : 'HISTORICAL',
    viewedRevisionId: read.revision.revision_id,
    loading: false,
    error: '',
    newRevisionAvailable: !isCurrent,
  };
}

export function refreshArtifactCurrent(
  session: ArtifactSurfaceSession,
  current: ArtifactReadView,
  history: ArtifactHistoryView,
): ArtifactSurfaceSession {
  if (session.mode === 'HISTORICAL') {
    return {
      ...session,
      history,
      loading: false,
      error: '',
      newRevisionAvailable:
        session.viewedRevisionId !== current.artifact.current_revision_id,
    };
  }
  return {
    ...session,
    read: current,
    history,
    mode: 'CURRENT',
    viewedRevisionId: current.revision.revision_id,
    loading: false,
    error: '',
    newRevisionAvailable: false,
  };
}

export function activeArtifactContext(
  session: ArtifactSurfaceSession | null,
): ActiveArtifactContext | null {
  const read = session?.read;
  if (!session || !read || !session.viewedRevisionId) return null;
  return {
    artifact_id: read.artifact.artifact_id,
    artifact_type: read.artifact.artifact_type,
    viewed_revision_id: session.viewedRevisionId,
    current_revision_id: read.artifact.current_revision_id,
    view_mode: session.mode,
    archived: read.artifact.archived_at !== null,
    selected_slide:
      read.artifact.artifact_type === 'PRESENTATION' ? session.selectedSlide : null,
    selected_sheet_id:
      read.artifact.artifact_type === 'SPREADSHEET'
        ? (session.selectedSheetId as SpreadsheetSheetId | null)
        : null,
  };
}

export interface SpreadsheetViewport {
  rows: number[];
  columns: number[];
  cells: Map<string, SpreadsheetCellV1>;
}

export function spreadsheetViewport(
  cells: SpreadsheetCellV1[],
  rowStart: number,
  columnStart: number,
  rowCount = 20,
  columnCount = 10,
): SpreadsheetViewport {
  const safeRows = Math.min(Math.max(rowCount, 1), 40);
  const safeColumns = Math.min(Math.max(columnCount, 1), 20);
  const rows = Array.from({ length: safeRows }, (_, index) => rowStart + index);
  const columns = Array.from({ length: safeColumns }, (_, index) => columnStart + index);
  const rowEnd = rowStart + safeRows;
  const columnEnd = columnStart + safeColumns;
  const visible = new Map<string, SpreadsheetCellV1>();
  for (const cell of cells) {
    if (
      cell.row >= rowStart && cell.row < rowEnd
      && cell.column >= columnStart && cell.column < columnEnd
    ) {
      visible.set(`${cell.row}:${cell.column}`, cell);
    }
  }
  return { rows, columns, cells: visible };
}

export function artifactTypeLabel(type: ArtifactType): string {
  return {
    DOCUMENT: '文档',
    PRESENTATION: '演示文稿',
    DIAGRAM: '图示',
    SPREADSHEET: '电子表格',
    FILE_MUTATION: '文件变更',
  }[type];
}
