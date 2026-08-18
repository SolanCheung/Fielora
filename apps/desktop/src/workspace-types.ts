export interface PickProjectRequest {
  title: string;
  goal: string | null;
}

export interface WorkspaceProjectRequest {
  field_id: string;
}

export interface WorkspaceFileEntry {
  relative_path: string;
  size: number;
}

export interface WorkspaceFileRequest extends WorkspaceProjectRequest {
  relative_path: string;
}

export interface WorkspaceFileView extends WorkspaceFileEntry {
  content: string;
  sha256: string;
}

export type WorkspaceAttachmentStatus = 'READY' | 'UNSUPPORTED' | 'TOO_LARGE';

export interface WorkspaceAttachmentView {
  id: string;
  name: string;
  size: number;
  status: WorkspaceAttachmentStatus;
  content: string | null;
  sha256: string | null;
  reason: string | null;
}

export interface WorkspaceAttachmentSelection {
  attachments: WorkspaceAttachmentView[];
  truncated_count: number;
}

export interface ApplyWorkspaceFileRequest extends WorkspaceFileRequest {
  expected_sha256: string;
  content: string;
}

export interface RunTerminalRequest extends WorkspaceProjectRequest {
  command: string;
}

export interface CancelTerminalRequest {
  run_id: string;
}

export interface TerminalRunResult {
  run_id: string;
}

export type TerminalEventKind = 'STARTED' | 'OUTPUT' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

export interface TerminalEvent {
  event: 'event.workspace.terminal';
  run_id: string;
  field_id: string;
  kind: TerminalEventKind;
  stream: 'STDOUT' | 'STDERR' | null;
  text: string | null;
  exit_code: number | null;
}
