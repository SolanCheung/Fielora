export const channels = {
  fieldCreate: 'fielora:field:create',
  fieldList: 'fielora:field:list',
  fieldGet: 'fielora:field:get',
  fieldUpdateFocus: 'fielora:field:update-focus',
  surfaceSaveSnapshot: 'fielora:surface:save-snapshot',
  surfaceLatestSnapshot: 'fielora:surface:latest-snapshot',
  coreHealth: 'fielora:core:health',
  coreRetry: 'fielora:core:retry',
  coreOpenLogs: 'fielora:core:open-logs',
  coreQuit: 'fielora:core:quit',
  coreEvent: 'fielora:core:event',
  testKillCore: 'fielora:test:kill-core',
} as const;

export type InvokeChannel = Exclude<(typeof channels)[keyof typeof channels], typeof channels.coreEvent>;
