import {
  File,
  FileC,
  FileCode,
  FileCpp,
  FileCss,
  FileHtml,
  FileImage,
  FileIni,
  FileJpg,
  FileJs,
  FileJsx,
  FileMd,
  FilePng,
  FilePy,
  FileRs,
  FileSql,
  FileSvg,
  FileTs,
  FileTsx,
  FileVue,
  type Icon,
} from '@phosphor-icons/react';

export type FileIconKind = 'typescript' | 'javascript' | 'code' | 'html' | 'style' | 'json' | 'config' | 'markdown' | 'image' | 'file';

function fileIcon(path: string): { kind: FileIconKind; icon: Icon } {
  const extension = path.split('.').at(-1)?.toLocaleLowerCase() ?? '';
  if (extension === 'ts') return { kind: 'typescript', icon: FileTs };
  if (extension === 'tsx') return { kind: 'typescript', icon: FileTsx };
  if (extension === 'js' || extension === 'mjs' || extension === 'cjs') return { kind: 'javascript', icon: FileJs };
  if (extension === 'jsx') return { kind: 'javascript', icon: FileJsx };
  if (extension === 'rs') return { kind: 'code', icon: FileRs };
  if (extension === 'py') return { kind: 'code', icon: FilePy };
  if (extension === 'c' || extension === 'h') return { kind: 'code', icon: FileC };
  if (['cc', 'cpp', 'hpp'].includes(extension)) return { kind: 'code', icon: FileCpp };
  if (extension === 'sql') return { kind: 'code', icon: FileSql };
  if (extension === 'html' || extension === 'htm') return { kind: 'html', icon: FileHtml };
  if (extension === 'vue') return { kind: 'html', icon: FileVue };
  if (['css', 'scss', 'sass', 'less'].includes(extension)) return { kind: 'style', icon: FileCss };
  if (extension === 'json' || extension === 'jsonc') return { kind: 'json', icon: FileCode };
  if (['yaml', 'yml', 'toml', 'xml', 'ini', 'env'].includes(extension)) return { kind: 'config', icon: FileIni };
  if (extension === 'md' || extension === 'mdx') return { kind: 'markdown', icon: FileMd };
  if (extension === 'png') return { kind: 'image', icon: FilePng };
  if (extension === 'jpg' || extension === 'jpeg') return { kind: 'image', icon: FileJpg };
  if (extension === 'svg') return { kind: 'image', icon: FileSvg };
  if (['webp', 'gif', 'bmp', 'ico'].includes(extension)) return { kind: 'image', icon: FileImage };
  if (['go', 'java', 'cs', 'sh', 'ps1'].includes(extension)) return { kind: 'code', icon: FileCode };
  return { kind: 'file', icon: File };
}

export function FileTypeIcon({ path }: { path: string }) {
  const { kind, icon: IconComponent } = fileIcon(path);
  return <IconComponent className={`file-type-icon is-${kind}`} data-file-kind={kind} size={18} weight="duotone" aria-hidden="true" focusable="false" />;
}
