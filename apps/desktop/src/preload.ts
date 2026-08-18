import { contextBridge, ipcRenderer } from 'electron';
import { channels } from './channels';
import type { FieloraBridge } from './types';
import type { DesktopCoreEvent } from './types';

const bridge: FieloraBridge = {
  project: {
    pick: (request) => ipcRenderer.invoke(channels.projectPick, request),
    list: () => ipcRenderer.invoke(channels.projectList),
    get: (request) => ipcRenderer.invoke(channels.projectGet, request),
  },
  conversation: {
    create: (request) => ipcRenderer.invoke(channels.conversationCreate, request),
    list: (request) => ipcRenderer.invoke(channels.conversationList, request),
    get: (request) => ipcRenderer.invoke(channels.conversationGet, request),
    update: (request) => ipcRenderer.invoke(channels.conversationUpdate, request),
    archive: (request) => ipcRenderer.invoke(channels.conversationArchive, request),
    createMessage: (request) => ipcRenderer.invoke(channels.conversationMessageCreate, request),
    listMessages: (request) => ipcRenderer.invoke(channels.conversationMessageList, request),
  },
  workspace: {
    listFiles: (request) => ipcRenderer.invoke(channels.workspaceFileList, request),
    readFile: (request) => ipcRenderer.invoke(channels.workspaceFileRead, request),
    applyFile: (request) => ipcRenderer.invoke(channels.workspaceFileApply, request),
    pickAttachments: () => ipcRenderer.invoke(channels.workspaceAttachmentPick),
    runTerminal: (request) => ipcRenderer.invoke(channels.workspaceTerminalRun, request),
    cancelTerminal: (request) => ipcRenderer.invoke(channels.workspaceTerminalCancel, request),
    subscribe: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
      ipcRenderer.on(channels.workspaceEvent, wrapped);
      return () => ipcRenderer.removeListener(channels.workspaceEvent, wrapped);
    },
  },
  field: {
    create: (request) => ipcRenderer.invoke(channels.fieldCreate, request),
    list: () => ipcRenderer.invoke(channels.fieldList),
    get: (request) => ipcRenderer.invoke(channels.fieldGet, request),
    updateFocus: (request) => ipcRenderer.invoke(channels.fieldUpdateFocus, request),
    updateMode: (request) => ipcRenderer.invoke(channels.fieldUpdateMode, request),
    setFocusV1: (request) => ipcRenderer.invoke(channels.fieldSetFocusV1, request),
    resumeV1: (request) => ipcRenderer.invoke(channels.fieldResumeV1, request),
  },
  state: {
    create: (request) => ipcRenderer.invoke(channels.stateCreate, request),
    get: (request) => ipcRenderer.invoke(channels.stateGet, request),
    list: (request) => ipcRenderer.invoke(channels.stateList, request),
    revise: (request) => ipcRenderer.invoke(channels.stateRevise, request),
    transition: (request) => ipcRenderer.invoke(channels.stateTransition, request),
    supersede: (request) => ipcRenderer.invoke(channels.stateSupersede, request),
  },
  reference: {
    create: (request) => ipcRenderer.invoke(channels.referenceCreate, request),
    get: (request) => ipcRenderer.invoke(channels.referenceGet, request),
    list: (request) => ipcRenderer.invoke(channels.referenceList, request),
    revise: (request) => ipcRenderer.invoke(channels.referenceRevise, request),
    archive: (request) => ipcRenderer.invoke(channels.referenceArchive, request),
    restore: (request) => ipcRenderer.invoke(channels.referenceRestore, request),
  },
  relation: {
    attachReferenceSource: (request) => ipcRenderer.invoke(channels.relationAttachReferenceSource, request),
    retractReferenceSource: (request) => ipcRenderer.invoke(channels.relationRetractReferenceSource, request),
    list: (request) => ipcRenderer.invoke(channels.relationList, request),
  },
  activity: {
    list: (request) => ipcRenderer.invoke(channels.activityList, request),
  },
  surface: {
    saveSnapshot: (request) => ipcRenderer.invoke(channels.surfaceSaveSnapshot, request),
    latestSnapshot: (request) => ipcRenderer.invoke(channels.surfaceLatestSnapshot, request),
    saveSnapshotV1: (request) => ipcRenderer.invoke(channels.surfaceSaveSnapshotV1, request),
  },
  browser: {
    show: (bounds) => ipcRenderer.invoke(channels.browserShow, bounds),
    hide: () => ipcRenderer.invoke(channels.browserHide),
    createPage: () => ipcRenderer.invoke(channels.browserCreatePage),
    switchPage: (request) => ipcRenderer.invoke(channels.browserSwitchPage, request),
    closePage: (request) => ipcRenderer.invoke(channels.browserClosePage, request),
    showPageContextMenu: (request) => ipcRenderer.invoke(channels.browserShowPageContextMenu, request),
    navigate: (request) => ipcRenderer.invoke(channels.browserNavigate, request),
    back: () => ipcRenderer.invoke(channels.browserBack),
    forward: () => ipcRenderer.invoke(channels.browserForward),
    reload: () => ipcRenderer.invoke(channels.browserReload),
    getState: () => ipcRenderer.invoke(channels.browserState),
    getContextCandidate: () => ipcRenderer.invoke(channels.browserContext),
    subscribe: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
      ipcRenderer.on(channels.browserEvent, wrapped);
      return () => ipcRenderer.removeListener(channels.browserEvent, wrapped);
    },
  },
  provider: {
    create: (request) => ipcRenderer.invoke(channels.providerCreate, request),
    update: (request) => ipcRenderer.invoke(channels.providerUpdate, request),
    storeCredential: (request) => ipcRenderer.invoke(channels.providerStoreCredential, request),
    deleteCredential: (request) => ipcRenderer.invoke(channels.providerDeleteCredential, request),
    remove: (request) => ipcRenderer.invoke(channels.providerRemove, request),
    probe: (request) => ipcRenderer.invoke(channels.providerProbe, request),
    list: () => ipcRenderer.invoke(channels.providerList),
    get: (request) => ipcRenderer.invoke(channels.providerGet, request),
  },
  model: {
    start: (request) => ipcRenderer.invoke(channels.modelStart, request),
    cancel: (request) => ipcRenderer.invoke(channels.modelCancel, request),
  },
  agent: {
    start: (request) => ipcRenderer.invoke(channels.agentStart, request),
    get: (request) => ipcRenderer.invoke(channels.agentGet, request),
    list: (request) => ipcRenderer.invoke(channels.agentList, request),
    events: (request) => ipcRenderer.invoke(channels.agentEvents, request),
    toolCalls: (request) => ipcRenderer.invoke(channels.agentToolCalls, request),
    cancel: (request) => ipcRenderer.invoke(channels.agentCancel, request),
    resume: (request) => ipcRenderer.invoke(channels.agentResume, request),
    resolveApproval: (request) => ipcRenderer.invoke(channels.agentResolveApproval, request),
  },
  capture: {
    create: (request) => ipcRenderer.invoke(channels.captureCreate, request),
    attach: (request) => ipcRenderer.invoke(channels.captureAttach, request),
    promote: (request) => ipcRenderer.invoke(channels.capturePromote, request),
    archive: (request) => ipcRenderer.invoke(channels.captureArchive, request),
    restore: (request) => ipcRenderer.invoke(channels.captureRestore, request),
    list: (request) => ipcRenderer.invoke(channels.captureList, request),
    get: (request) => ipcRenderer.invoke(channels.captureGet, request),
  },
  core: {
    getHealth: () => ipcRenderer.invoke(channels.coreHealth),
    subscribe: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: DesktopCoreEvent) => listener(payload);
      ipcRenderer.on(channels.coreEvent, wrapped);
      return () => ipcRenderer.removeListener(channels.coreEvent, wrapped);
    },
    retry: () => ipcRenderer.invoke(channels.coreRetry),
    openLogs: () => ipcRenderer.invoke(channels.coreOpenLogs),
    quit: () => ipcRenderer.invoke(channels.coreQuit),
  },
};

contextBridge.exposeInMainWorld('fielora', bridge);

if (process.env.FIELORA_E2E === '1') {
  contextBridge.exposeInMainWorld('fieloraTest', {
    killCore: () => ipcRenderer.invoke(channels.testKillCore),
    resizeWindow: (size: { width: number; height: number }) => ipcRenderer.invoke(channels.testResizeWindow, size),
    createProject: (request: Parameters<NonNullable<Window['fieloraTest']>['createProject']>[0]) => ipcRenderer.invoke(channels.testCreateProject, request),
  });
}
