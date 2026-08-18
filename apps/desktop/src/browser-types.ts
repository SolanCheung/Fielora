export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserNavigateRequest {
  url: string;
}

export interface BrowserPageRequest {
  page_id: string;
}

export interface BrowserContextCandidate {
  page_id: string;
  navigation_generation: number;
  url: string;
  title: string;
  page_text: string;
  selection_text: string;
  is_partial: boolean;
}

export interface BrowserSurfaceState {
  app_view: 'BROWSE' | 'NOT_BROWSE';
  attached: boolean;
  visible: boolean;
  bounds: BrowserViewBounds;
}

export interface BrowserPage {
  id: string;
  url: string;
  title: string;
  favicon_data_url: string | null;
  can_go_back: boolean;
  can_go_forward: boolean;
  is_loading: boolean;
  error: string | null;
}

export interface BrowserPageState extends Omit<BrowserPage, 'id'> {
  active_page_id: string;
  pages: BrowserPage[];
  surface: BrowserSurfaceState;
}
