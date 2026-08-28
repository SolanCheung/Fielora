import assert from 'node:assert/strict';
import test from 'node:test';
import type { ArtifactHistoryView, ArtifactReadView, SpreadsheetCellV1 } from '@fielora/contracts';
import {
  activeArtifactContext, artifactTabId, emptyArtifactSession, pinArtifactRevision,
  refreshArtifactCurrent, spreadsheetViewport,
} from './artifact-working-surface.ts';

function read(revision: number, current: number, type: 'DOCUMENT' | 'PRESENTATION' | 'SPREADSHEET' = 'DOCUMENT'): ArtifactReadView {
  const content = type === 'PRESENTATION'
    ? { type, content: { slides: [{ layout: 'TITLE', title: 'Slide', regions: [] }] } }
    : type === 'SPREADSHEET'
      ? { type, content: { title: 'Sheet', sheets: [{ sheet_id: 'sheet-main', name: 'Main', cells: [] }] } }
      : { type, content: { title: 'Doc', blocks: [] } };
  return {
    artifact: {
      artifact_id: 'artifact-1', profile_id: 'profile-1', artifact_type: type,
      title: 'Fixture', project_field_id: 'field-1', current_revision_id: `revision-${current}`,
      created_from_conversation_id: 'conversation-1', created_by_agent_run_id: 'run-1',
      updated_by_device: 'device-1', created_at: 1, updated_at: current, archived_at: null,
    },
    revision: {
      revision_id: `revision-${revision}`, artifact_id: 'artifact-1', sequence: revision,
      parent_revision_id: revision > 1 ? `revision-${revision - 1}` : null,
      mutation_kind: revision === 1 ? 'CREATE' : 'UPDATE', content_schema_version: 1,
      semantic_sha256: String(revision).padStart(64, '0'), content,
      created_from_conversation_id: 'conversation-1', created_by_agent_run_id: 'run-1',
      created_by_tool_call_id: `tool-${revision}`, created_at: revision,
    },
  } as ArtifactReadView;
}

function history(current: ArtifactReadView): ArtifactHistoryView {
  return { artifact: current.artifact, revisions: [], next_before_sequence: null };
}

test('Artifact tab identity deduplicates by durable Artifact identity', () => {
  assert.equal(artifactTabId('same'), 'artifact:same');
  assert.equal(new Set([artifactTabId('same'), artifactTabId('same')]).size, 1);
});

test('CURRENT follows new revisions while a pinned HISTORICAL revision stays fixed', () => {
  const r1 = read(1, 1);
  let session = refreshArtifactCurrent(emptyArtifactSession('artifact-1'), r1, history(r1));
  assert.equal(session.mode, 'CURRENT');
  const r3Current = read(3, 3);
  session = refreshArtifactCurrent(session, r3Current, history(r3Current));
  assert.equal(session.read?.revision.revision_id, 'revision-3');

  const pinnedR1 = read(1, 3);
  session = pinArtifactRevision(session, pinnedR1, history(r3Current));
  assert.equal(session.mode, 'HISTORICAL');
  const r4 = read(4, 4);
  session = refreshArtifactCurrent(session, r4, history(r4));
  assert.equal(session.read?.revision.revision_id, 'revision-1');
  assert.equal(session.newRevisionAvailable, true);
});

test('active context contains bounded identity metadata and exact historical mode only', () => {
  const current = read(3, 3, 'PRESENTATION');
  const session = { ...refreshArtifactCurrent(emptyArtifactSession('artifact-1'), current, history(current)), selectedSlide: 0 };
  const context = activeArtifactContext(session);
  assert.deepEqual(context, {
    artifact_id: 'artifact-1', artifact_type: 'PRESENTATION', viewed_revision_id: 'revision-3',
    current_revision_id: 'revision-3', view_mode: 'CURRENT', archived: false,
    selected_slide: 0, selected_sheet_id: null,
  });
  assert.equal(JSON.stringify(context).includes('slides'), false);
  assert.equal(JSON.stringify(context).includes('content'), false);
});

test('sparse Spreadsheet viewport never expands to max coordinate product', () => {
  const cells = Array.from({ length: 4_096 }, (_, index) => ({
    row: index === 4_095 ? 2000 : Math.floor(index / 255) + 1,
    column: index === 4_095 ? 256 : index % 255 + 1,
    value: index === 0
      ? { kind: 'STRING' as const, value: '起点' }
      : { kind: 'DECIMAL' as const, value: String(index) },
    format: null,
    presentation: null,
  })) as SpreadsheetCellV1[];
  const first = spreadsheetViewport(cells, 1, 1);
  const far = spreadsheetViewport(cells, 1981, 247);
  assert.equal(first.rows.length * first.columns.length, 200);
  assert.equal(far.rows.length * far.columns.length, 200);
  assert.equal(far.cells.get('2000:256')?.value.kind, 'DECIMAL');
});
