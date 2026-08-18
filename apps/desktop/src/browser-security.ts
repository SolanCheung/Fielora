import type { WebPreferences } from 'electron';

export const UNTRUSTED_WEB_PREFERENCES = Object.freeze({
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  safeDialogs: true,
  navigateOnDragDrop: false,
  spellcheck: true,
} satisfies Readonly<WebPreferences>);
