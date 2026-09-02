import {
  AppWindow,
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowsOutSimple,
  CaretDown,
  ChatCircle,
  ChatCircleDots,
  Books,
  CalendarBlank,
  Check,
  Clock,
  CloudArrowUp,
  Columns,
  Copy,
  Cpu,
  Database,
  Desktop,
  DotsThree,
  File,
  FilePlus,
  FileText,
  Files,
  Folder,
  FolderOpen,
  Gear,
  GitBranch,
  Globe,
  HandPalm,
  Image,
  Info,
  Keyboard,
  Microphone,
  MagnifyingGlass,
  Pause,
  PencilSimple,
  Plus,
  PlusMinus,
  Play,
  PuzzlePiece,
  Sidebar,
  SidebarSimple,
  SlidersHorizontal,
  SortAscending,
  Shapes,
  SquaresFour,
  Stop,
  Sun,
  Terminal,
  TerminalWindow,
  Trash,
  Tray,
  WarningOctagon,
  X,
  type Icon,
  type IconProps,
  type IconWeight,
} from '@phosphor-icons/react';

export type AppIconName =
  | 'compose' | 'conversation' | 'now' | 'scheduled' | 'browse' | 'fields' | 'inbox'
  | 'folder' | 'folderOpen' | 'files' | 'library' | 'file' | 'image' | 'filePlus' | 'objects'
  | 'diff' | 'terminal' | 'terminalPanel' | 'computer' | 'settings' | 'refresh' | 'close'
  | 'more' | 'models' | 'appearance' | 'extensions' | 'storage' | 'keyboard'
  | 'info' | 'environment' | 'branch' | 'cloud' | 'source' | 'copy' | 'check'
  | 'sort' | 'plus' | 'edit' | 'search' | 'run' | 'pause' | 'delete' | 'chevronDown' | 'panelRight' | 'sidebar'
  | 'back' | 'forward' | 'focus' | 'tools' | 'microphone' | 'send' | 'stop'
  | 'permissionAsk' | 'permissionReview' | 'permissionFull' | 'application';

const ICONS: Record<AppIconName, Icon> = {
  compose: PencilSimple,
  conversation: ChatCircle,
  now: Clock,
  scheduled: CalendarBlank,
  browse: Globe,
  fields: SquaresFour,
  inbox: Tray,
  folder: Folder,
  folderOpen: FolderOpen,
  files: Files,
  library: Books,
  file: File,
  image: Image,
  filePlus: FilePlus,
  objects: Shapes,
  diff: PlusMinus,
  terminal: Terminal,
  terminalPanel: TerminalWindow,
  computer: Desktop,
  settings: Gear,
  refresh: ArrowClockwise,
  close: X,
  more: DotsThree,
  models: Cpu,
  appearance: Sun,
  extensions: PuzzlePiece,
  storage: Database,
  keyboard: Keyboard,
  info: Info,
  environment: SlidersHorizontal,
  branch: GitBranch,
  cloud: CloudArrowUp,
  source: FileText,
  copy: Copy,
  check: Check,
  sort: SortAscending,
  plus: Plus,
  edit: PencilSimple,
  search: MagnifyingGlass,
  run: Play,
  pause: Pause,
  delete: Trash,
  chevronDown: CaretDown,
  panelRight: SidebarSimple,
  sidebar: Sidebar,
  back: ArrowLeft,
  forward: ArrowRight,
  focus: ArrowsOutSimple,
  tools: Columns,
  microphone: Microphone,
  send: ArrowUp,
  stop: Stop,
  permissionAsk: HandPalm,
  permissionReview: ChatCircleDots,
  permissionFull: WarningOctagon,
  application: AppWindow,
};

export interface FieloraIconProps extends Omit<IconProps, 'size' | 'weight'> {
  name: AppIconName;
  size?: 'sm' | 'md' | 'lg';
  weight?: IconWeight;
}

export function FieloraIcon({ name, size = 'md', weight = 'regular', className = '', ...props }: FieloraIconProps) {
  const IconComponent = ICONS[name];
  return <IconComponent
    {...props}
    className={`app-icon shell-icon size-${size}${className ? ` ${className}` : ''}`}
    size={24}
    weight={weight}
    aria-hidden="true"
    focusable="false"
    data-icon={name}
    data-icon-size={size}
  />;
}

export const AppIcon = FieloraIcon;
