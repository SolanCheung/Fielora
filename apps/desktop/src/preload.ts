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
  },
  surface: {
    saveSnapshot: (request) => ipcRenderer.invoke(channels.surfaceSaveSnapshot, request),
    latestSnapshot: (request) => ipcRenderer.invoke(channels.surfaceLatestSnapshot, request),
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
