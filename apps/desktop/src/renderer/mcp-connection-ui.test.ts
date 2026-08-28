import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rendererRoot = new URL('./', import.meta.url);
const desktopRoot = new URL('../', import.meta.url);

test('MCP Settings stays passive while activation belongs to current AgentRun details', async () => {
  const [settings, mcpSettings, turn, workspace] = await Promise.all([
    readFile(new URL('SettingsScreen.tsx', rendererRoot), 'utf8'),
    readFile(new URL('McpSettings.tsx', rendererRoot), 'utf8'),
    readFile(new URL('AgentTurn.tsx', rendererRoot), 'utf8'),
    readFile(new URL('ProjectWorkspace.tsx', rendererRoot), 'utf8'),
  ]);
  assert.match(settings, /id: 'EXTENSIONS', label: '能力与扩展'/);
  assert.match(mcpSettings, /agent\.mcpConnections\(\)/);
  assert.match(mcpSettings, /credential_binding_count/);
  assert.match(mcpSettings, /credential_missing_count/);
  assert.doesNotMatch(mcpSettings, /credential_ref|GITHUB_TOKEN/);
  assert.doesNotMatch(mcpSettings, /activateMcpConnection|spawn|execFile|list_tools/);
  assert.match(turn, /MCP for this run/);
  assert.match(workspace, /activateMcpConnection\(\{ run_id: agentRun\.id, connection_id: connectionId \}\)/);
  assert.doesNotMatch(workspace, /activateMcpConnection\([^)]*(?:command|args|digest|executable)/s);
});

test('Desktop bridge exposes bounded MCP queries and one exact activation command', async () => {
  const [channels, preload, types, main] = await Promise.all([
    readFile(new URL('channels.ts', desktopRoot), 'utf8'),
    readFile(new URL('preload.ts', desktopRoot), 'utf8'),
    readFile(new URL('types.ts', desktopRoot), 'utf8'),
    readFile(new URL('main.ts', desktopRoot), 'utf8'),
  ]);
  assert.match(channels, /agentMcpConnections/);
  assert.match(channels, /agentMcpRuntime/);
  assert.match(channels, /agentActivateMcpConnection/);
  assert.match(preload, /mcpConnections: \(\) => ipcRenderer\.invoke\(channels\.agentMcpConnections\)/);
  assert.match(types, /activateMcpConnection\(request: ActivateMcpConnectionRequest\)/);
  assert.match(main, /command\.agent\.activate_mcp_connection/);
  assert.doesNotMatch(`${preload}\n${types}`, /mcp.*(?:spawn|processHandle|environment|headers)/i);
});
