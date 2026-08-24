import { access, readFile, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, nativeTheme, protocol, shell } from 'electron';
import type { ContextMenuParams, IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import type { ProjectView } from '@fielora/contracts';
import { BrowserRuntime } from './browser-runtime';
import { channels } from './channels';
import { assertTrustedSender, isAllowedNavigation, trustedOriginFor } from './security';
import { CoreProcessSupervisor } from './supervisor';
import {
  validateArchiveReference, validateAttachReferenceSource, validateCreate, validateCreateReference,
  validateCreateState, validateFocus, validateListActivities, validateListReferences,
  validateListRelations, validateListStates, validateObjectReference, validateReference,
  validateRestoreReference, validateRetractReferenceSource, validateReviseReference,
  validateReviseState, validateSetFocusV1, validateSnapshot, validateSnapshotV1,
  validateStateReference, validateSupersedeState, validateTransitionState, validateUpdateMode,
  validateBrowserBounds, validateBrowserNavigate, validateBrowserPageRequest,
  validateClipboardText,
  validateCreateProvider, validateUpdateProvider, validateProviderReference, validateStoreCredential,
  validateStartModel, validateCancelModel, validateCreateCapture, validateCaptureReference,
  validateMutateCapture, validateAttachCapture, validatePromoteCapture, validateListCaptures,
  validatePickProject, validateCreateProject, validateUpdateProject, validateArchiveProject, validateWorkspaceProject, validateCreateConversation,
  validateConversationReference, validateUpdateConversation, validateArchiveConversation,
  validateCreateConversationMessage, validateListConversationMessages, validateWorkspaceFile,
  validateApplyWorkspaceFile, validateRunTerminal, validateCancelTerminal, validateOpenWorkspaceProject,
  validateStartAgent, validateAgentRun, validateListAgentRuns, validateListAgentEvents,
  validateResolveAgentApproval,
  validateReadWorkspaceAttachment, validateSaveWorkspaceAttachment, validateStoreWorkspaceAttachment,
} from './validation';
import { WorkspaceRuntime } from './workspace-runtime';
import { loadSelectedAttachments, readStoredImage, storeImageAttachment } from './attachment-runtime';
import { focusUsableWindow, usableWindow, withUsableWindow } from './window-lifecycle';
import { desktopFoundationUserDataPath, hasExplicitUserDataDirectory } from './runtime-identity';
import { windowSurfaceColors, type WindowSurfaceTheme } from './window-surface';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

protocol.registerSchemesAsPrivileged([
  { scheme: 'fielora', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Historical Phase 04 builds used Electron's default @fielora/desktop profile.
// A stranded historical process can therefore own that profile's single-instance
// lock and intercept a newer executable. Desktop Foundation has a stable runtime
// profile of its own; Core data remains under LOCALAPPDATA/Fielora and is unchanged.
if (process.env.FIELORA_E2E !== '1' && !hasExplicitUserDataDirectory(process.argv)) {
  app.setPath('userData', desktopFoundationUserDataPath(app.getPath('appData')));
}

if (process.env.FIELORA_E2E === '1' && /^\d{2,5}$/.test(process.env.FIELORA_E2E_DEBUG_PORT ?? '')) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.FIELORA_E2E_DEBUG_PORT);
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
}

let appWindow: BrowserWindow | undefined;
let browserRuntime: BrowserRuntime | undefined;
let trustedOrigin = '';
let quitting = false;
const supervisor = new CoreProcessSupervisor();
const workspaceRuntime = new WorkspaceRuntime((event) => {
  withUsableWindow(appWindow, (window) => window.webContents.send(channels.workspaceEvent, event));
});

function browser(): BrowserRuntime {
  if (!browserRuntime) throw new Error('Browse runtime is unavailable');
  return browserRuntime;
}

function assertBridgeEvent(event: IpcMainInvokeEvent): void {
  const window = usableWindow(appWindow);
  if (!window || !event.senderFrame) throw new Error('Untrusted bridge sender');
  assertTrustedSender({
    senderId: event.sender.id,
    expectedSenderId: window.webContents.id,
    frameUrl: event.senderFrame.url,
    isMainFrame: event.senderFrame === event.sender.mainFrame,
  }, trustedOrigin);
}

function showTrustedEditContextMenu(params: ContextMenuParams): void {
  const window = usableWindow(appWindow);
  if (!window) return;
  const contents = window.webContents;
  const template: MenuItemConstructorOptions[] = [];
  if (params.isEditable) {
    template.push({ label: '撤销', accelerator: 'Ctrl+Z', enabled: params.editFlags.canUndo, click: () => contents.undo() });
    template.push({ label: '重做', accelerator: 'Ctrl+Y', enabled: params.editFlags.canRedo, click: () => contents.redo() });
    template.push({ type: 'separator' });
    template.push({ label: '剪切', accelerator: 'Ctrl+X', enabled: params.editFlags.canCut, click: () => contents.cut() });
    template.push({ label: '复制', accelerator: 'Ctrl+C', enabled: params.editFlags.canCopy, click: () => contents.copy() });
    template.push({ label: '粘贴', accelerator: 'Ctrl+V', enabled: params.editFlags.canPaste, click: () => contents.paste() });
    template.push({ type: 'separator' });
    template.push({ label: '全选', accelerator: 'Ctrl+A', enabled: params.editFlags.canSelectAll, click: () => contents.selectAll() });
  } else if (params.selectionText) {
    template.push({ label: '复制', accelerator: 'Ctrl+C', enabled: params.editFlags.canCopy, click: () => contents.copy() });
  }
  if (template.length === 0) return;
  if (!app.isPackaged || process.env.FIELORA_E2E === '1') {
    console.info(`[trusted-context-menu] editable=${params.isEditable} selection=${Boolean(params.selectionText)} items=${template.filter((item) => item.type !== 'separator').length}`);
  }
  Menu.buildFromTemplate(template).popup({ window });
}

function handle(channel: string, validator: (payload: unknown) => unknown, method: string): void {
  ipcMain.handle(channel, async (event, payload) => {
    assertBridgeEvent(event);
    return supervisor.request(method, validator(payload));
  });
}

async function projectRoot(fieldId: string): Promise<string> {
  const project = await supervisor.request('query.project.get', { field_id: fieldId }) as ProjectView;
  return project.root_path;
}

type WorkspaceOpenTargetId = import('./workspace-types').WorkspaceProjectOpenTarget;
type WorkspaceOpenTargetView = import('./workspace-types').WorkspaceProjectOpenTargetView;

const workspaceOpenApplications: Array<{
  target: Exclude<WorkspaceOpenTargetId, 'FILE_EXPLORER'>;
  label: string;
  commands: string[];
  commonPaths: string[];
}> = [
  { target: 'VISUAL_STUDIO_CODE', label: 'Visual Studio Code', commands: ['Code.exe', 'code.exe'], commonPaths: [path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft VS Code', 'Code.exe'), path.join(process.env.ProgramFiles ?? '', 'Microsoft VS Code', 'Code.exe')] },
  { target: 'CURSOR', label: 'Cursor', commands: ['Cursor.exe', 'cursor.exe'], commonPaths: [path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'cursor', 'Cursor.exe'), path.join(process.env.ProgramFiles ?? '', 'Cursor', 'Cursor.exe')] },
  { target: 'VISUAL_STUDIO', label: 'Visual Studio', commands: ['devenv.exe'], commonPaths: [] },
  { target: 'GIT_BASH', label: 'Git Bash', commands: ['git-bash.exe'], commonPaths: [path.join(process.env.ProgramFiles ?? '', 'Git', 'git-bash.exe')] },
  { target: 'INTELLIJ_IDEA', label: 'IntelliJ IDEA', commands: ['idea64.exe', 'idea.exe'], commonPaths: [] },
  { target: 'PYCHARM', label: 'PyCharm', commands: ['pycharm64.exe', 'pycharm.exe'], commonPaths: [] },
  { target: 'WEBSTORM', label: 'WebStorm', commands: ['webstorm64.exe', 'webstorm.exe'], commonPaths: [] },
];

async function findWorkspaceApplication(target: Exclude<WorkspaceOpenTargetId, 'FILE_EXPLORER'>): Promise<string | null> {
  const application = workspaceOpenApplications.find((item) => item.target === target);
  if (!application) return null;
  for (const candidate of application.commonPaths.filter((value) => path.isAbsolute(value))) {
    try { await access(candidate); return candidate; } catch { /* Try PATH next. */ }
  }
  for (const command of application.commands) {
    const registryKeys = [
      `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${command}`,
      `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${command}`,
      `HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${command}`,
      ...(target === 'VISUAL_STUDIO_CODE' ? ['HKCR\\vscode\\shell\\open\\command'] : []),
      ...(target === 'CURSOR' ? ['HKCR\\cursor\\shell\\open\\command'] : []),
    ];
    for (const key of registryKeys) {
      const registered = await new Promise<string | null>((resolve) => {
        execFile('reg.exe', ['query', key, '/ve'], { windowsHide: true, timeout: 2_500 }, (error, stdout) => {
          if (error) { resolve(null); return; }
          const value = stdout.match(/REG_SZ\s+(.+)$/mu)?.[1]?.trim() ?? '';
          resolve(value.match(/^"([^"]+\.exe)"/iu)?.[1] ?? value.match(/^([^\s]+\.exe)/iu)?.[1] ?? null);
        });
      });
      if (registered) {
        try { await access(registered); return registered; } catch { /* Keep looking. */ }
      }
    }
    const located = await new Promise<string | null>((resolve) => {
      execFile('where.exe', [command], { windowsHide: true, timeout: 2_500 }, (error, stdout) => resolve(error ? null : stdout.split(/\r?\n/u).find(Boolean) ?? null));
    });
    if (located) return located;
  }
  return null;
}

async function workspaceProtocolAvailable(target: Exclude<WorkspaceOpenTargetId, 'FILE_EXPLORER'>): Promise<boolean> {
  const scheme = target === 'VISUAL_STUDIO_CODE' ? 'vscode' : target === 'CURSOR' ? 'cursor' : null;
  if (!scheme) return false;
  return new Promise<boolean>((resolve) => execFile('reg.exe', ['query', `HKCR\\${scheme}\\shell\\open\\command`, '/ve'], { windowsHide: true, timeout: 2_500 }, (error) => resolve(!error)));
}

async function workspaceApplicationIcon(executable: string | null): Promise<string | null> {
  if (!executable) return null;
  try {
    const icon = await app.getFileIcon(executable, { size: 'normal' });
    return icon.isEmpty() ? null : icon.toDataURL();
  } catch {
    return null;
  }
}

let workspaceOpenTargetsCache: WorkspaceOpenTargetView[] | null = null;

async function workspaceOpenTargets(): Promise<WorkspaceOpenTargetView[]> {
  if (workspaceOpenTargetsCache) return workspaceOpenTargetsCache;
  const explorerExecutable = path.join(process.env.WINDIR || 'C:\\Windows', 'explorer.exe');
  const detected = await Promise.all(workspaceOpenApplications.map(async (application) => {
    const executable = await findWorkspaceApplication(application.target);
    const available = Boolean(executable) || await workspaceProtocolAvailable(application.target);
    return { application, available, iconDataUrl: await workspaceApplicationIcon(executable) };
  }));
  workspaceOpenTargetsCache = [
    { target: 'FILE_EXPLORER', label: '文件资源管理器', icon_data_url: await workspaceApplicationIcon(explorerExecutable) },
    ...detected.filter((item) => item.available).map(({ application, iconDataUrl }) => ({ target: application.target, label: application.label, icon_data_url: iconDataUrl })),
  ];
  return workspaceOpenTargetsCache;
}

function registerBridgeHandlers(): void {
  ipcMain.handle(channels.windowTitlebarTheme, (event, payload) => {
    assertBridgeEvent(event);
    if (payload !== 'LIGHT' && payload !== 'DARK') throw new Error('Invalid titlebar theme');
    const surface = windowSurfaceColors(payload as WindowSurfaceTheme);
    withUsableWindow(appWindow, (window) => {
      window.setBackgroundColor(surface.background);
      window.setTitleBarOverlay({ color: surface.background, symbolColor: surface.symbols, height: surface.height });
    });
    return null;
  });
  ipcMain.handle(channels.projectPick, async (event, payload) => {
    assertBridgeEvent(event);
    const request = validatePickProject(payload);
    if (!appWindow || appWindow.isDestroyed()) throw new Error('App window is unavailable');
    let rootPath: string;
    if (process.env.FIELORA_E2E === '1' && process.env.FIELORA_E2E_PROJECT_PATH) {
      rootPath = path.resolve(process.env.FIELORA_E2E_PROJECT_PATH);
    } else {
      const selection = await dialog.showOpenDialog(appWindow, { title: '选择 Project 文件夹', properties: ['openDirectory', 'createDirectory'] });
      if (selection.canceled || selection.filePaths.length !== 1) return null;
      rootPath = path.resolve(selection.filePaths[0]!);
    }
    return supervisor.request('command.project.create', {
      title: request.title.trim() || path.basename(rootPath), goal: request.goal, root_path: rootPath,
    });
  });
  ipcMain.handle(channels.projectList, (event) => { assertBridgeEvent(event); return supervisor.request('query.project.list'); });
  handle(channels.projectGet, validateReference, 'query.project.get');
  handle(channels.projectUpdate, validateUpdateProject, 'command.project.update');
  handle(channels.projectArchive, validateArchiveProject, 'command.project.archive');
  handle(channels.conversationCreate, validateCreateConversation, 'command.conversation.create');
  handle(channels.conversationList, validateReference, 'query.conversation.list');
  handle(channels.conversationGet, validateConversationReference, 'query.conversation.get');
  handle(channels.conversationUpdate, validateUpdateConversation, 'command.conversation.update');
  handle(channels.conversationArchive, validateArchiveConversation, 'command.conversation.archive');
  handle(channels.conversationMessageCreate, validateCreateConversationMessage, 'command.conversation.message.create');
  handle(channels.conversationMessageList, validateListConversationMessages, 'query.conversation.message.list');
  ipcMain.handle(channels.workspaceFileList, async (event, payload) => {
    assertBridgeEvent(event); const request=validateWorkspaceProject(payload);
    return workspaceRuntime.listFiles(await projectRoot(request.field_id));
  });
  ipcMain.handle(channels.workspaceFileRead, async (event, payload) => {
    assertBridgeEvent(event); const request=validateWorkspaceFile(payload);
    return workspaceRuntime.readFile(await projectRoot(request.field_id), request.relative_path);
  });
  ipcMain.handle(channels.workspaceFilePreview, async (event, payload) => {
    assertBridgeEvent(event); const request=validateWorkspaceFile(payload);
    return workspaceRuntime.previewImage(await projectRoot(request.field_id), request.relative_path);
  });
  ipcMain.handle(channels.workspaceAttachmentPick, async (event) => {
    assertBridgeEvent(event);
    if (!appWindow || appWindow.isDestroyed()) throw new Error('App window is unavailable');
    let filePaths: string[];
    if (process.env.FIELORA_E2E === '1' && process.env.FIELORA_E2E_ATTACHMENT_PATHS) {
      const fixturePaths: unknown = JSON.parse(process.env.FIELORA_E2E_ATTACHMENT_PATHS);
      if (!Array.isArray(fixturePaths) || fixturePaths.some((item) => typeof item !== 'string')) throw new Error('Invalid attachment fixture');
      filePaths = fixturePaths;
    } else {
      const selection = await dialog.showOpenDialog(appWindow, { title: '添加附件', properties: ['openFile', 'multiSelections'] });
      if (selection.canceled) return { attachments: [], truncated_count: 0 };
      filePaths = selection.filePaths;
    }
    return loadSelectedAttachments(filePaths);
  });
  ipcMain.handle(channels.workspaceAttachmentStore, async (event, payload) => {
    assertBridgeEvent(event);
    return storeImageAttachment(path.join(app.getPath('userData'), 'conversation-attachments'), validateStoreWorkspaceAttachment(payload));
  });
  ipcMain.handle(channels.workspaceAttachmentRead, async (event, payload) => {
    assertBridgeEvent(event);
    const request = validateReadWorkspaceAttachment(payload);
    const stored = await readStoredImage(path.join(app.getPath('userData'), 'conversation-attachments'), request.content_ref);
    return { data_url: stored.data_url, mime_type: stored.mime_type };
  });
  ipcMain.handle(channels.workspaceAttachmentCopy, async (event, payload) => {
    assertBridgeEvent(event);
    const request = validateReadWorkspaceAttachment(payload);
    const stored = await readStoredImage(path.join(app.getPath('userData'), 'conversation-attachments'), request.content_ref);
    const image = nativeImage.createFromBuffer(Buffer.from(stored.bytes));
    if (image.isEmpty()) throw new Error('Attachment image is unavailable');
    clipboard.writeImage(image);
    const copied = clipboard.readImage();
    if (copied.isEmpty()) throw new Error('Attachment image was not copied');
    const size = copied.getSize();
    return { copied: true, width: size.width, height: size.height };
  });
  ipcMain.handle(channels.workspaceAttachmentSave, async (event, payload) => {
    assertBridgeEvent(event);
    const request = validateSaveWorkspaceAttachment(payload);
    const stored = await readStoredImage(path.join(app.getPath('userData'), 'conversation-attachments'), request.content_ref);
    let target = process.env.FIELORA_E2E_ATTACHMENT_SAVE_PATH ?? '';
    if (!target) {
      if (!appWindow || appWindow.isDestroyed()) throw new Error('App window is unavailable');
      const selection = await dialog.showSaveDialog(appWindow, { title: '图片另存为', defaultPath: request.filename });
      if (selection.canceled || !selection.filePath) return { saved: false, canceled: true };
      target = selection.filePath;
    }
    await writeFile(target, stored.bytes);
    return { saved: true, canceled: false };
  });
  ipcMain.handle(channels.workspaceFileApply, async (event, payload) => {
    assertBridgeEvent(event); const request=validateApplyWorkspaceFile(payload);
    return workspaceRuntime.applyFile(await projectRoot(request.field_id), request);
  });
  ipcMain.handle(channels.workspaceEnvironment, async (event, payload) => {
    assertBridgeEvent(event); const request=validateWorkspaceProject(payload);
    return workspaceRuntime.getEnvironment(await projectRoot(request.field_id));
  });
  ipcMain.handle(channels.workspaceOpenTargets, async (event, payload) => {
    assertBridgeEvent(event); validateWorkspaceProject(payload);
    return workspaceOpenTargets();
  });
  ipcMain.handle(channels.workspaceOpenProject, async (event, payload) => {
    assertBridgeEvent(event);
    const request = validateOpenWorkspaceProject(payload);
    const root = await projectRoot(request.field_id);
    if (request.target === 'FILE_EXPLORER') {
      const error = await shell.openPath(root);
      if (error) throw new Error('无法在文件资源管理器中打开当前 Project');
      return null;
    }
    const executable = await findWorkspaceApplication(request.target);
    if (!executable && (request.target === 'VISUAL_STUDIO_CODE' || request.target === 'CURSOR') && await workspaceProtocolAvailable(request.target)) {
      const scheme = request.target === 'VISUAL_STUDIO_CODE' ? 'vscode' : 'cursor';
      await shell.openExternal(`${scheme}://file/${encodeURI(root.replaceAll('\\', '/'))}`);
      return null;
    }
    if (!executable) throw new Error('这个应用当前不可用');
    const child = spawn(executable, [root], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' });
    child.unref();
    return null;
  });
  ipcMain.handle(channels.workspaceTerminalRun, async (event, payload) => {
    assertBridgeEvent(event); const request=validateRunTerminal(payload);
    return workspaceRuntime.runTerminal(await projectRoot(request.field_id), request.field_id, request.command, request.working_directory);
  });
  ipcMain.handle(channels.workspaceTerminalCancel, (event, payload) => {
    assertBridgeEvent(event); const request=validateCancelTerminal(payload);
    workspaceRuntime.cancelTerminal(request.run_id); return null;
  });
  handle(channels.fieldCreate, validateCreate, 'command.field.create');
  ipcMain.handle(channels.fieldList, async (event) => {
    assertBridgeEvent(event);
    return supervisor.request('query.field.list');
  });
  handle(channels.fieldGet, validateReference, 'query.field.get');
  handle(channels.fieldUpdateFocus, validateFocus, 'command.field.update_focus');
  handle(channels.fieldUpdateMode, validateUpdateMode, 'command.field.update_mode');
  handle(channels.fieldSetFocusV1, validateSetFocusV1, 'command.field.set_focus_v1');
  handle(channels.fieldResumeV1, validateReference, 'query.field.resume_v1');
  handle(channels.stateCreate, validateCreateState, 'command.state.create');
  handle(channels.stateGet, validateStateReference, 'query.state.get');
  handle(channels.stateList, validateListStates, 'query.state.list');
  handle(channels.stateRevise, validateReviseState, 'command.state.revise');
  handle(channels.stateTransition, validateTransitionState, 'command.state.transition');
  handle(channels.stateSupersede, validateSupersedeState, 'command.state.supersede');
  handle(channels.referenceCreate, validateCreateReference, 'command.reference.create');
  handle(channels.referenceGet, validateObjectReference, 'query.reference.get');
  handle(channels.referenceList, validateListReferences, 'query.reference.list');
  handle(channels.referenceRevise, validateReviseReference, 'command.reference.revise');
  handle(channels.referenceArchive, validateArchiveReference, 'command.reference.archive');
  handle(channels.referenceRestore, validateRestoreReference, 'command.reference.restore');
  handle(channels.relationAttachReferenceSource, validateAttachReferenceSource, 'command.relation.attach_reference_source');
  handle(channels.relationRetractReferenceSource, validateRetractReferenceSource, 'command.relation.retract_reference_source');
  handle(channels.relationList, validateListRelations, 'query.relation.list');
  handle(channels.activityList, validateListActivities, 'query.activity.list');
  handle(channels.surfaceSaveSnapshot, validateSnapshot, 'command.surface.save_snapshot');
  handle(channels.surfaceSaveSnapshotV1, validateSnapshotV1, 'command.surface.save_snapshot_v1');
  handle(channels.surfaceLatestSnapshot, validateReference, 'query.surface.latest_snapshot');
  ipcMain.handle(channels.clipboardWriteText, (event, payload) => {
    assertBridgeEvent(event);
    clipboard.writeText(validateClipboardText(payload));
  });
  handle(channels.providerCreate, validateCreateProvider, 'command.provider.create_config');
  handle(channels.providerUpdate, validateUpdateProvider, 'command.provider.update_config');
  handle(channels.providerStoreCredential, validateStoreCredential, 'command.provider.store_credential');
  handle(channels.providerDeleteCredential, validateProviderReference, 'command.provider.delete_credential');
  handle(channels.providerRemove, validateProviderReference, 'command.provider.remove_config');
  handle(channels.providerProbe, validateProviderReference, 'command.provider.probe');
  ipcMain.handle(channels.providerList, (event) => { assertBridgeEvent(event); return supervisor.request('query.provider.list_configs'); });
  handle(channels.providerGet, validateProviderReference, 'query.provider.get_config');
  ipcMain.handle(channels.modelStart, async (event, payload) => {
    assertBridgeEvent(event);
    const request=validateStartModel(payload);
    if(request.context_package.some((chip)=>chip.kind==='CURRENT_PAGE'||chip.kind==='CURRENT_SELECTION')){
      const candidate=await browser().getContextCandidate();
      request.context_package=request.context_package.map((chip)=>{
        if(chip.kind!=='CURRENT_PAGE'&&chip.kind!=='CURRENT_SELECTION')return chip;
        if(chip.source_identity!==candidate.page_id||chip.source_revision_or_navigation_generation!==String(candidate.navigation_generation))throw new Error('Browse context became stale');
        if(chip.kind==='CURRENT_SELECTION'&&!candidate.selection_text)throw new Error('Browse selection became stale');
        return {...chip,display_label:chip.kind==='CURRENT_SELECTION'?'Current selection':(candidate.title||candidate.url),content:chip.kind==='CURRENT_SELECTION'?candidate.selection_text:`${candidate.url}\n\n${candidate.page_text}`,completeness:chip.kind==='CURRENT_SELECTION'||!candidate.is_partial?'COMPLETE':'PARTIAL'};
      });
    }
    return supervisor.request('command.model.start',request);
  });
  handle(channels.modelCancel, validateCancelModel, 'command.model.cancel');
  handle(channels.agentStart, validateStartAgent, 'command.agent.start');
  handle(channels.agentGet, validateAgentRun, 'query.agent.get');
  handle(channels.agentList, validateListAgentRuns, 'query.agent.list');
  handle(channels.agentEvents, validateListAgentEvents, 'query.agent.events');
  handle(channels.agentToolCalls, validateAgentRun, 'query.agent.tool_calls');
  handle(channels.agentCancel, validateAgentRun, 'command.agent.cancel');
  handle(channels.agentPause, validateAgentRun, 'command.agent.pause');
  handle(channels.agentResume, validateAgentRun, 'command.agent.resume');
  handle(channels.agentResolveApproval, validateResolveAgentApproval, 'command.agent.resolve_approval');
  handle(channels.captureCreate, validateCreateCapture, 'command.capture.create');
  handle(channels.captureAttach, validateAttachCapture, 'command.capture.attach');
  handle(channels.capturePromote, validatePromoteCapture, 'command.capture.promote');
  handle(channels.captureArchive, validateMutateCapture, 'command.capture.archive');
  handle(channels.captureRestore, validateMutateCapture, 'command.capture.restore');
  handle(channels.captureList, validateListCaptures, 'query.capture.list');
  handle(channels.captureGet, validateCaptureReference, 'query.capture.get');
  ipcMain.handle(channels.browserShow, (event, payload) => { assertBridgeEvent(event); return browser().show(validateBrowserBounds(payload)); });
  ipcMain.handle(channels.browserHide, (event) => { assertBridgeEvent(event); return browser().hide(); });
  ipcMain.handle(channels.browserCreatePage, (event) => { assertBridgeEvent(event); return browser().createPage(); });
  ipcMain.handle(channels.browserSwitchPage, (event, payload) => { assertBridgeEvent(event); return browser().switchPage(validateBrowserPageRequest(payload).page_id); });
  ipcMain.handle(channels.browserClosePage, (event, payload) => { assertBridgeEvent(event); return browser().closePage(validateBrowserPageRequest(payload).page_id); });
  ipcMain.handle(channels.browserShowPageContextMenu, (event, payload) => { assertBridgeEvent(event); return browser().showPageContextMenu(validateBrowserPageRequest(payload).page_id); });
  ipcMain.handle(channels.browserNavigate, (event, payload) => { assertBridgeEvent(event); return browser().navigate(validateBrowserNavigate(payload).url); });
  ipcMain.handle(channels.browserBack, (event) => { assertBridgeEvent(event); return browser().back(); });
  ipcMain.handle(channels.browserForward, (event) => { assertBridgeEvent(event); return browser().forward(); });
  ipcMain.handle(channels.browserReload, (event) => { assertBridgeEvent(event); return browser().reload(); });
  ipcMain.handle(channels.browserState, (event) => { assertBridgeEvent(event); return browser().getState(); });
  ipcMain.handle(channels.browserContext, (event) => { assertBridgeEvent(event); return browser().getContextCandidate(); });
  ipcMain.handle(channels.coreHealth, (event) => { assertBridgeEvent(event); return supervisor.getHealth(); });
  ipcMain.handle(channels.coreBuildProvenance, (event) => { assertBridgeEvent(event); return supervisor.request('query.system.build_provenance'); });
  ipcMain.handle(channels.coreRetry, async (event) => { assertBridgeEvent(event); await supervisor.retry(); });
  ipcMain.handle(channels.coreOpenLogs, async (event) => {
    assertBridgeEvent(event);
    const dbPath = supervisor.getHealth().db_path;
    if (dbPath) await shell.openPath(path.join(path.dirname(path.dirname(dbPath)), 'logs'));
  });
  ipcMain.handle(channels.coreQuit, (event) => { assertBridgeEvent(event); app.quit(); });
  if (process.env.FIELORA_E2E === '1') {
    ipcMain.handle(channels.testKillCore, (event) => { assertBridgeEvent(event); supervisor.killForTest(); });
    ipcMain.handle(channels.testResizeWindow, (event, payload: unknown) => {
      assertBridgeEvent(event);
      if (!payload || typeof payload !== 'object') throw new Error('Window size must be an object');
      if (Object.keys(payload).sort().join(',') !== 'height,width') throw new Error('Window size has unexpected fields');
      const { width, height } = payload as Record<string, unknown>;
      if (!Number.isInteger(width) || !Number.isInteger(height) || Number(width) < 900 || Number(width) > 2400 || Number(height) < 620 || Number(height) > 1600) {
        throw new Error('Window size is outside the E2E range');
      }
      if (!appWindow || appWindow.isDestroyed()) throw new Error('App window is unavailable');
      appWindow.setSize(Number(width), Number(height));
      const bounds = appWindow.getBounds();
      return { width: bounds.width, height: bounds.height };
    });
    ipcMain.handle(channels.testCreateProject, (event, payload) => {
      assertBridgeEvent(event);
      return supervisor.request('command.project.create', validateCreateProject(payload));
    });
  }
}

async function registerApplicationProtocol(): Promise<void> {
  protocol.handle('fielora', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    let relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (relative.startsWith('main_window/')) relative = relative.slice('main_window/'.length);
    if (relative.includes('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 });
    const rendererRoot = path.join(app.getAppPath(), '.webpack', 'renderer', 'main_window');
    try {
      const bytes = await readFile(path.join(rendererRoot, relative));
      const type = relative.endsWith('.html') ? 'text/html; charset=utf-8'
        : relative.endsWith('.js') ? 'text/javascript; charset=utf-8'
          : relative.endsWith('.css') ? 'text/css; charset=utf-8'
            : relative.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
      return new Response(bytes, {
        headers: {
          'Content-Type': type,
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

async function createWindow(): Promise<void> {
  trustedOrigin = trustedOriginFor(app.isPackaged, MAIN_WINDOW_WEBPACK_ENTRY);
  const initialSurface = windowSurfaceColors(nativeTheme.shouldUseDarkColors ? 'DARK' : 'LIGHT');
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: initialSurface.background,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: initialSurface.background, symbolColor: initialSurface.symbols, height: initialSurface.height },
    show: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  appWindow = window;
  window.removeMenu();
  browserRuntime = new BrowserRuntime(window, (state) => {
    withUsableWindow(appWindow, (current) => current.webContents.send(channels.browserEvent, state));
  }, !app.isPackaged || process.env.FIELORA_E2E === '1');
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('context-menu', (_event, params) => showTrustedEditContextMenu(params));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, trustedOrigin)) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url, trustedOrigin)) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.once('ready-to-show', () => withUsableWindow(window, (current) => current.show()));
  window.on('close', () => {
    if (appWindow !== window) return;
    appWindow = undefined;
    const runtime = browserRuntime;
    browserRuntime = undefined;
    runtime?.destroy();
  });
  window.on('closed', () => {
    if (appWindow === window) appWindow = undefined;
  });
  if (app.isPackaged) await window.loadURL('fielora://app/index.html');
  else await window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
}

// E2E instances use isolated LOCALAPPDATA roots and must be able to run while a
// user is reviewing a packaged build. Production still keeps the single-instance invariant.
const singleInstance = process.env.FIELORA_E2E === '1' || app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on('second-instance', () => { focusUsableWindow(appWindow); });
  app.whenReady().then(async () => {
    registerBridgeHandlers();
    if (app.isPackaged) await registerApplicationProtocol();
    await createWindow();
    supervisor.on('notification', (message) => {
      withUsableWindow(appWindow, (window) => window.webContents.send(channels.coreEvent, (message as { params: unknown }).params));
    });
    supervisor.on('health', (payload) => {
      withUsableWindow(appWindow, (window) => window.webContents.send(channels.coreEvent, { event: 'event.core.health', ...payload }));
    });
    void supervisor.start().catch((error) => console.error('Core startup failed', error));
  });
}

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void supervisor.shutdown().finally(() => {
    workspaceRuntime.dispose();
    browserRuntime?.destroy();
    browserRuntime = undefined;
    app.exit(0);
  });
});

app.on('window-all-closed', () => app.quit());
