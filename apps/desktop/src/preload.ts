import { contextBridge, ipcRenderer } from 'electron';
import { channels } from './channels';
import type { FieloraBridge } from './types';
import type { DesktopCoreEvent } from './types';

const bridge: FieloraBridge = {
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
  });
}
