import { randomUUID } from 'node:crypto';
import { BrowserWindow, Menu, WebContentsView, clipboard, nativeImage, session } from 'electron';
import type { ContextMenuParams, MenuItemConstructorOptions, Session, WebContents } from 'electron';
import {
  allowedWindowOpenTarget,
  browserNavigationInitiatorForDocument,
  fitBrowserBounds,
  isAllowedBrowseNavigation,
  normalizeBrowserAddress,
} from './browser-policy';
import type { BrowserNavigationInitiator } from './browser-policy';
import { UNTRUSTED_WEB_PREFERENCES } from './browser-security';
import type { BrowserPage, BrowserPageState, BrowserViewBounds } from './browser-types';

interface RuntimePage {
  state: BrowserPage;
  view?: WebContentsView;
  committedUrl: string;
  navigationGeneration: number;
  pendingNavigation?: {
    target: string;
    initiator: BrowserNavigationInitiator;
  };
  directNavigation?: {
    target: string;
    initiator: BrowserNavigationInitiator;
  };
}

const MAX_FAVICON_BYTES = 64 * 1024;
const ALLOWED_FAVICON_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/vnd.microsoft.icon',
  'image/webp',
  'image/x-icon',
]);

export class BrowserRuntime {
  private readonly pages = new Map<string, RuntimePage>();
  private pageOrder: string[] = [];
  private activePageId = '';
  private requestedBounds: BrowserViewBounds | undefined;
  private requestedVisible = false;
  private visiblePageId: string | undefined;
  private readonly browseSession: Session;
  private lastDiagnostic = '';
  private hostResizeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly handleHostResize = () => {
    if (this.hostResizeTimer) clearTimeout(this.hostResizeTimer);
    this.hostResizeTimer = setTimeout(() => {
      this.hostResizeTimer = undefined;
      this.layout('window-resize-settled');
    }, 75);
  };

  constructor(
    private readonly host: BrowserWindow,
    private readonly publish: (state: BrowserPageState) => void,
    private readonly diagnosticsEnabled = false,
  ) {
    this.browseSession = session.fromPartition('persist:fielora-browse');
    this.browseSession.setPermissionCheckHandler(() => false);
    this.browseSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    this.browseSession.setDevicePermissionHandler(() => false);
    this.browseSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    this.browseSession.webRequest.onBeforeRequest((details, callback) => {
      const targetProtocol = protocolOf(details.url);
      if (targetProtocol !== 'file:' && targetProtocol !== 'fielora:') {
        callback({});
        return;
      }
      const page = this.pageForWebContents(details.webContents, details.webContentsId);
      const initiator = page
        ? this.navigationInitiator(page, details.url, details.frame?.url || details.referrer, details.resourceType === 'mainFrame')
        : 'OPAQUE_PAGE';
      const allowed = isAllowedBrowseNavigation(details.url, initiator);
      if (this.diagnosticsEnabled) {
        console.info(`[browse-security:request] target=${targetProtocol} resource=${details.resourceType} page=${page ? page.state.id : '(unknown)'} initiator=${initiator} decision=${allowed ? 'allow' : 'deny'}`);
      }
      callback({ cancel: !allowed });
    });
    const initialPage = this.addPage();
    this.activePageId = initialPage.state.id;
    this.host.on('resize', this.handleHostResize);
  }

  getState(): BrowserPageState {
    const active = this.activePage?.state;
    return {
      active_page_id: active?.id ?? '',
      pages: this.pageOrder.map((pageId) => ({ ...this.requirePage(pageId).state })),
      url: active?.url ?? '',
      title: active?.title ?? '',
      favicon_data_url: active?.favicon_data_url ?? null,
      can_go_back: active?.can_go_back ?? false,
      can_go_forward: active?.can_go_forward ?? false,
      is_loading: active?.is_loading ?? false,
      error: active?.error ?? null,
      surface: this.surfaceState(),
    };
  }

  show(bounds: BrowserViewBounds): BrowserPageState {
    this.requestedVisible = true;
    this.requestedBounds = bounds;
    this.layout('show');
    return this.getState();
  }

  hide(): BrowserPageState {
    this.requestedVisible = false;
    this.layout('hide');
    return this.getState();
  }

  createPage(): BrowserPageState {
    const page = this.addPage();
    this.activePageId = page.state.id;
    this.layout('create-page');
    return this.getState();
  }

  switchPage(pageId: string): BrowserPageState {
    this.requirePage(pageId);
    this.activePageId = pageId;
    this.layout('switch-page');
    return this.getState();
  }

  closePage(pageId: string): BrowserPageState {
    const page = this.requirePage(pageId);
    const closingIndex = this.pageOrder.indexOf(pageId);
    const wasActive = pageId === this.activePageId;
    this.pages.delete(pageId);
    this.pageOrder = this.pageOrder.filter((candidate) => candidate !== pageId);
    this.destroyPageView(page);

    if (this.pageOrder.length === 0) {
      this.activePageId = '';
    } else if (wasActive) {
      this.activePageId = this.pageOrder[Math.min(closingIndex, this.pageOrder.length - 1)]!;
    }

    this.layout('close-page');
    return this.getState();
  }

  showPageContextMenu(pageId: string): BrowserPageState {
    const page = this.requirePage(pageId);
    const contents = page.view?.webContents;
    const template: MenuItemConstructorOptions[] = [];
    if (contents && !contents.isDestroyed() && page.state.url) {
      template.push({ label: '重新加载', accelerator: 'Ctrl+R', click: () => this.reloadPage(page) });
      template.push({ label: '复制页面地址', click: () => clipboard.writeText(page.state.url) });
      template.push({ type: 'separator' });
    }
    template.push({ label: '关闭页面', accelerator: 'Ctrl+W', click: () => { if (this.isLivePage(page)) this.closePage(pageId); } });
    if (this.diagnosticsEnabled) {
      console.info(`[browse-page-context-menu] page=${page.state.id} loaded=${Boolean(page.state.url)} items=${template.filter((item) => item.type !== 'separator').length}`);
    }
    Menu.buildFromTemplate(template).popup({ window: this.host });
    return this.getState();
  }

  async navigate(address: string): Promise<BrowserPageState> {
    const target = normalizeBrowserAddress(address);
    let page = this.activePage;
    if (!page) {
      page = this.addPage();
      this.activePageId = page.state.id;
    }
    return this.loadTarget(page, target, 'USER');
  }

  back(): BrowserPageState {
    const contents = this.activePage?.view?.webContents;
    if (contents) {
      const index = contents.navigationHistory.getActiveIndex();
      if (index > 0) this.goToHistoryIndex(this.activePage!, index - 1);
    }
    return this.getState();
  }

  forward(): BrowserPageState {
    const contents = this.activePage?.view?.webContents;
    if (contents) {
      const index = contents.navigationHistory.getActiveIndex();
      if (index + 1 < contents.navigationHistory.length()) this.goToHistoryIndex(this.activePage!, index + 1);
    }
    return this.getState();
  }

  reload(): BrowserPageState {
    const page = this.activePage;
    if (page) this.reloadPage(page);
    return this.getState();
  }

  async getContextCandidate(): Promise<import('./browser-types').BrowserContextCandidate> {
    const page=this.activePage; if(!page?.view||page.view.webContents.isDestroyed()||!page.state.url) throw new Error('No active Browse page');
    const capturedPageId=page.state.id; const capturedGeneration=page.navigationGeneration;
    const result=await page.view.webContents.executeJavaScript(`(()=>{const selection=String(window.getSelection?.()?.toString()||'').slice(0,65536);const raw=String(document.body?.innerText||'');return {selection_text:selection,page_text:raw.slice(0,131072),is_partial:raw.length>131072};})()`,true) as {selection_text:string;page_text:string;is_partial:boolean};
    if(this.activePageId!==capturedPageId||page.navigationGeneration!==capturedGeneration) throw new Error('Browse context became stale');
    return {page_id:capturedPageId,navigation_generation:capturedGeneration,url:page.state.url,title:page.state.title,page_text:result.page_text,selection_text:result.selection_text,is_partial:result.is_partial};
  }

  destroy(): void {
    this.host.removeListener('resize', this.handleHostResize);
    if (this.hostResizeTimer) clearTimeout(this.hostResizeTimer);
    this.hostResizeTimer = undefined;
    const existingPages = [...this.pages.values()];
    this.pages.clear();
    this.pageOrder = [];
    this.visiblePageId = undefined;
    for (const page of existingPages) this.destroyPageView(page);
    this.diagnose('destroy');
  }

  private get activePage(): RuntimePage | undefined {
    return this.pages.get(this.activePageId);
  }

  private addPage(): RuntimePage {
    const page: RuntimePage = {
      committedUrl: '',
      navigationGeneration: 0,
      state: {
        id: `page_${randomUUID()}`,
        url: '',
        title: '新页面',
        favicon_data_url: null,
        can_go_back: false,
        can_go_forward: false,
        is_loading: false,
        error: null,
      },
    };
    this.pages.set(page.state.id, page);
    this.pageOrder.push(page.state.id);
    return page;
  }

  private requirePage(pageId: string): RuntimePage {
    const page = this.pages.get(pageId);
    if (!page) throw new Error('Browse page no longer exists');
    return page;
  }

  private isLivePage(page: RuntimePage): boolean {
    return this.pages.get(page.state.id) === page;
  }

  private async openTargetInNewPage(target: string, initiator: BrowserNavigationInitiator): Promise<void> {
    const page = this.addPage();
    this.activePageId = page.state.id;
    this.layout('window-open-page');
    await this.loadTarget(page, target, initiator);
  }

  private async loadTarget(page: RuntimePage, target: string, initiator: BrowserNavigationInitiator): Promise<BrowserPageState> {
    if (!isAllowedBrowseNavigation(target, initiator)) throw new Error('Browse navigation blocked by policy');
    const authorization = { target, initiator };
    page.directNavigation = authorization;
    page.pendingNavigation = authorization;
    const contents = this.ensureView(page).webContents;
    page.state = { ...page.state, url: target, favicon_data_url: null, is_loading: true, error: null };
    this.layout('navigate');
    try {
      await contents.loadURL(target);
    } catch (reason) {
      if (this.isLivePage(page) && !page.state.error) {
        page.pendingNavigation = undefined;
        page.state = {
          ...page.state,
          is_loading: false,
          error: reason instanceof Error ? reason.message : '页面加载失败',
        };
        this.emit();
      }
    } finally {
      if (page.directNavigation === authorization) page.directNavigation = undefined;
    }
    return this.getState();
  }

  private ensureView(page: RuntimePage): WebContentsView {
    if (page.view) return page.view;
    const view = new WebContentsView({
      webPreferences: {
        session: this.browseSession,
        ...UNTRUSTED_WEB_PREFERENCES,
      },
    });
    view.setBackgroundColor('#ffffff');
    view.setVisible(false);
    this.host.contentView.addChildView(view);
    page.view = view;

    const contents = view.webContents;
    // A Browse Page starts at Chromium's 100% CSS zoom. Keeping this explicit avoids
    // a persisted or inherited zoom factor making the same native viewport render
    // differently from a regular Chromium window.
    contents.setZoomFactor(1);
    contents.setWindowOpenHandler(({ url, referrer }) => {
      const initiator = this.documentInitiator(referrer.url);
      const target = allowedWindowOpenTarget(url, initiator);
      if (target) {
        setImmediate(() => {
          if (this.isLivePage(page)) void this.openTargetInNewPage(target, initiator);
        });
      }
      return { action: 'deny' };
    });
    contents.on('context-menu', (_event, params) => this.showContextMenu(page, params));
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.on('will-frame-navigate', (event) => {
      const initiator = this.navigationInitiator(page, event.url, event.initiator?.url, event.isMainFrame);
      if (!isAllowedBrowseNavigation(event.url, initiator)) {
        event.preventDefault();
        return;
      }
      if (event.isMainFrame) page.pendingNavigation = { target: event.url, initiator };
    });
    contents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
      const initiator = this.navigationInitiator(page, url, undefined, isMainFrame);
      if (!isAllowedBrowseNavigation(url, initiator)) event.preventDefault();
    });
    contents.on('did-start-loading', () => {
      if (!this.isLivePage(page)) return;
      page.state = { ...this.readPageState(page), is_loading: true, error: null };
      this.emit();
    });
    contents.on('did-stop-loading', () => {
      if (!this.isLivePage(page)) return;
      page.state = { ...this.readPageState(page), is_loading: false, error: page.state.error };
      this.emit();
    });
    contents.on('did-navigate', () => { page.navigationGeneration += 1; this.commitPageNavigation(page); });
    contents.on('did-navigate-in-page', () => { page.navigationGeneration += 1; this.commitPageNavigation(page); });
    contents.on('page-title-updated', (event) => {
      event.preventDefault();
      this.refreshPage(page);
    });
    contents.on('page-favicon-updated', (_event, favicons) => {
      void this.updatePageFavicon(page, favicons);
    });
    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!this.isLivePage(page) || !isMainFrame || errorCode === -3) return;
      page.pendingNavigation = undefined;
      page.state = {
        ...this.readPageState(page),
        url: validatedUrl || page.state.url,
        is_loading: false,
        error: errorDescription || '页面加载失败',
      };
      this.emit();
    });
    contents.on('render-process-gone', (_event, details) => {
      if (!this.isLivePage(page)) return;
      page.state = { ...page.state, is_loading: false, error: `网页进程已停止（${details.reason}）` };
      this.emit();
    });

    this.layout('attach-page');
    return view;
  }

  private showContextMenu(page: RuntimePage, params: ContextMenuParams): void {
    const contents = page.view?.webContents;
    if (!contents || contents.isDestroyed()) return;

    const template: MenuItemConstructorOptions[] = [];
    const separator = () => {
      if (template.length > 0 && template.at(-1)?.type !== 'separator') template.push({ type: 'separator' });
    };
    const initiator = this.documentInitiator(params.frameURL || params.pageURL || page.committedUrl);
    const allowedLink = params.linkURL ? allowedWindowOpenTarget(params.linkURL, initiator) : null;

    if (params.linkURL) {
      if (allowedLink) {
        template.push({
          label: '在当前页面打开链接',
          click: () => { if (this.isLivePage(page)) void this.loadTarget(page, allowedLink, initiator); },
        });
        template.push({
          label: '在新页面中打开链接',
          click: () => { if (this.isLivePage(page)) void this.openTargetInNewPage(allowedLink, initiator); },
        });
      }
      template.push({ label: '复制链接地址', click: () => clipboard.writeText(params.linkURL) });
    }

    if (params.hasImageContents) {
      separator();
      template.push({ label: '复制图片', click: () => contents.copyImageAt(params.x, params.y) });
    }

    if (params.isEditable) {
      separator();
      template.push({ label: '撤销', accelerator: 'Ctrl+Z', enabled: params.editFlags.canUndo, click: () => contents.undo() });
      template.push({ label: '重做', accelerator: 'Ctrl+Y', enabled: params.editFlags.canRedo, click: () => contents.redo() });
      separator();
      template.push({ label: '剪切', accelerator: 'Ctrl+X', enabled: params.editFlags.canCut, click: () => contents.cut() });
      template.push({ label: '复制', accelerator: 'Ctrl+C', enabled: params.editFlags.canCopy, click: () => contents.copy() });
      template.push({ label: '粘贴', accelerator: 'Ctrl+V', enabled: params.editFlags.canPaste, click: () => contents.paste() });
      template.push({ label: '全选', accelerator: 'Ctrl+A', enabled: params.editFlags.canSelectAll, click: () => contents.selectAll() });
    } else if (params.selectionText) {
      separator();
      template.push({ label: '复制', accelerator: 'Ctrl+C', enabled: params.editFlags.canCopy, click: () => contents.copy() });
    }

    separator();
    const history = contents.navigationHistory;
    const activeIndex = history.getActiveIndex();
    template.push({
      label: '后退',
      enabled: activeIndex > 0,
      click: () => this.goToHistoryIndex(page, history.getActiveIndex() - 1),
    });
    template.push({
      label: '前进',
      enabled: activeIndex >= 0 && activeIndex + 1 < history.length(),
      click: () => this.goToHistoryIndex(page, history.getActiveIndex() + 1),
    });
    template.push({ label: '重新加载', accelerator: 'Ctrl+R', click: () => contents.reload() });

    separator();
    template.push({
      label: '检查',
      click: () => contents.inspectElement(params.x, params.y),
    });

    if (this.diagnosticsEnabled) {
      console.info(`[browse-context-menu] page=${page.state.id} editable=${params.isEditable} selection=${Boolean(params.selectionText)} link=${Boolean(params.linkURL)} image=${params.hasImageContents} inspect=true items=${template.filter((item) => item.type !== 'separator').length}`);
    }
    Menu.buildFromTemplate(template).popup({ window: this.host });
  }

  private readPageState(page: RuntimePage): BrowserPage {
    const contents = page.view?.webContents;
    if (!contents || contents.isDestroyed()) return { ...page.state };
    const currentUrl = contents.getURL();
    const activeIndex = contents.navigationHistory.getActiveIndex();
    const historyLength = contents.navigationHistory.length();
    return {
      id: page.state.id,
      url: currentUrl === 'about:blank' ? '' : currentUrl,
      title: contents.getTitle() || '新页面',
      favicon_data_url: page.state.favicon_data_url,
      can_go_back: activeIndex > 0,
      can_go_forward: activeIndex >= 0 && activeIndex + 1 < historyLength,
      is_loading: contents.isLoading(),
      error: null,
    };
  }

  private refreshPage(page: RuntimePage): void {
    if (!this.isLivePage(page)) return;
    page.state = { ...this.readPageState(page), error: page.state.error };
    this.emit();
  }

  private commitPageNavigation(page: RuntimePage): void {
    if (!this.isLivePage(page)) return;
    const currentUrl = page.view?.webContents.getURL() ?? page.committedUrl;
    if (currentUrl === 'about:blank' && page.pendingNavigation?.target !== 'about:blank') {
      this.refreshPage(page);
      return;
    }
    page.committedUrl = currentUrl;
    page.pendingNavigation = undefined;
    this.refreshPage(page);
  }

  private documentInitiator(value: string): BrowserNavigationInitiator {
    return browserNavigationInitiatorForDocument(value);
  }

  private navigationInitiator(
    page: RuntimePage,
    target: string,
    sourceUrl: string | undefined,
    isMainFrame: boolean,
  ): BrowserNavigationInitiator {
    if (isMainFrame && page.directNavigation && sameNavigationTarget(page.directNavigation.target, target)) {
      return page.directNavigation.initiator;
    }
    if (isMainFrame && page.pendingNavigation && sameNavigationTarget(page.pendingNavigation.target, target)) {
      return page.pendingNavigation.initiator;
    }
    if (isMainFrame && page.pendingNavigation) {
      const pendingTargetInitiator = this.documentInitiator(page.pendingNavigation.target);
      if (pendingTargetInitiator === 'REMOTE_PAGE') return pendingTargetInitiator;
    }
    if (sourceUrl) return this.documentInitiator(sourceUrl);
    if (page.pendingNavigation) return this.documentInitiator(page.pendingNavigation.target);
    return this.documentInitiator(page.committedUrl);
  }

  private pageForWebContents(webContents: WebContents | undefined, webContentsId: number | undefined): RuntimePage | undefined {
    return [...this.pages.values()].find((page) => {
      const candidate = page.view?.webContents;
      return candidate === webContents || (webContentsId !== undefined && candidate?.id === webContentsId);
    });
  }

  private goToHistoryIndex(page: RuntimePage, index: number): void {
    const contents = page.view?.webContents;
    if (!contents) return;
    const target = contents.navigationHistory.getEntryAtIndex(index)?.url;
    if (!target) return;
    page.pendingNavigation = { target, initiator: 'USER' };
    contents.navigationHistory.goToIndex(index);
  }

  private reloadPage(page: RuntimePage): void {
    const contents = page.view?.webContents;
    if (!contents || contents.isDestroyed()) return;
    const target = contents.getURL();
    if (target) page.pendingNavigation = { target, initiator: 'USER' };
    contents.reload();
  }

  private async updatePageFavicon(page: RuntimePage, favicons: string[]): Promise<void> {
    const contents = page.view?.webContents;
    if (!contents || contents.isDestroyed()) return;
    const pageUrl = contents.getURL();
    for (const favicon of favicons) {
      const dataUrl = await this.loadFaviconDataUrl(favicon);
      if (!dataUrl) continue;
      if (!this.isLivePage(page) || page.view?.webContents.getURL() !== pageUrl) return;
      page.state = { ...page.state, favicon_data_url: dataUrl };
      this.emit();
      return;
    }
  }

  private async loadFaviconDataUrl(value: string): Promise<string | null> {
    try {
      const parsed = new URL(value);
      if (!['data:', 'http:', 'https:'].includes(parsed.protocol)) return null;
      const response = await this.browseSession.fetch(value, { credentials: 'include' });
      if (!response.ok) return null;
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (contentLength > MAX_FAVICON_BYTES) return null;
      const type = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
      if (!ALLOWED_FAVICON_TYPES.has(type)) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_FAVICON_BYTES) return null;
      const image = nativeImage.createFromBuffer(bytes);
      if (image.isEmpty()) return null;
      const size = image.getSize();
      if (size.width > 4096 || size.height > 4096) return null;
      const png = image.resize({ width: 32, height: 32, quality: 'best' }).toPNG();
      if (png.length === 0 || png.length > MAX_FAVICON_BYTES) return null;
      return `data:image/png;base64,${png.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private destroyPageView(page: RuntimePage): void {
    const view = page.view;
    page.view = undefined;
    if (!view) return;
    if (this.host.contentView.children.includes(view)) this.host.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  private layout(reason: string): void {
    this.visiblePageId = undefined;
    const available = this.host.contentView.getBounds();
    const bounds = this.requestedBounds ? fitBrowserBounds(this.requestedBounds, available) : undefined;
    for (const pageId of this.pageOrder) {
      const page = this.requirePage(pageId);
      if (!page.view) continue;
      if (bounds) {
        const previous = page.view.getBounds();
        page.view.setBounds(bounds);
        const resizingLoadedActivePage = pageId === this.activePageId
          && this.requestedVisible
          && Boolean(page.state.url)
          && previous.width > 0
          && previous.height > 0
          && (previous.width !== bounds.width || previous.height !== bounds.height);
        // Windows can commit a moved divider to the native View while leaving the
        // already-loaded RenderWidget at its previous CSS viewport. Applying the
        // matching desktop viewport only for a live resize avoids that stale frame
        // without changing the site's session, DPR, mobile mode, or page scale.
        if (resizingLoadedActivePage && !page.view.webContents.isDestroyed()) {
          page.view.webContents.enableDeviceEmulation({
            screenPosition: 'desktop',
            screenSize: { width: bounds.width, height: bounds.height },
            viewPosition: { x: 0, y: 0 },
            deviceScaleFactor: 0,
            viewSize: { width: bounds.width, height: bounds.height },
            scale: 1,
          });
        }
      }
      const visible = Boolean(
        bounds
        && this.requestedVisible
        && pageId === this.activePageId
        && bounds.width > 0
        && bounds.height > 0,
      );
      page.view.setVisible(visible);
      if (visible) this.visiblePageId = pageId;
    }
    this.diagnose(reason);
    this.emit();
  }

  private emit(): void {
    this.diagnose('state');
    this.publish(this.getState());
  }

  private surfaceState(): BrowserPageState['surface'] {
    const activeView = this.activePage?.view;
    const attached = Boolean(activeView && this.host.contentView.children.includes(activeView));
    const bounds = activeView?.getBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
    return {
      app_view: this.requestedVisible ? 'BROWSE' : 'NOT_BROWSE',
      attached,
      visible: attached && this.visiblePageId === this.activePageId,
      bounds: { ...bounds },
    };
  }

  private diagnose(reason: string): void {
    if (!this.diagnosticsEnabled) return;
    const state = this.getState();
    const url = diagnosticUrl(state.url);
    const title = state.title.replace(/\s+/g, ' ').slice(0, 160);
    const hostBounds = this.host.contentView.getBounds();
    const zoom = this.activePage?.view?.webContents.getZoomFactor() ?? 1;
    const diagnostic = `app_view=${state.surface.app_view} attached=${state.surface.attached} visible=${state.surface.visible} host=${hostBounds.width}/${hostBounds.height} bounds=${state.surface.bounds.x}/${state.surface.bounds.y}/${state.surface.bounds.width}/${state.surface.bounds.height} zoom=${zoom.toFixed(2)} pages=${state.pages.length} active=${state.active_page_id} url=${url} title=${JSON.stringify(title)}`;
    if (diagnostic === this.lastDiagnostic) return;
    this.lastDiagnostic = diagnostic;
    console.info(`[browse-runtime:${reason}] ${diagnostic}`);
  }
}

function diagnosticUrl(value: string): string {
  if (!value) return '(empty)';
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '(invalid)';
  }
}

function protocolOf(value: string): string {
  try {
    return new URL(value).protocol;
  } catch {
    return '';
  }
}

function sameNavigationTarget(left: string, right: string): boolean {
  try {
    return new URL(left).toString() === new URL(right).toString();
  } catch {
    return left === right;
  }
}
