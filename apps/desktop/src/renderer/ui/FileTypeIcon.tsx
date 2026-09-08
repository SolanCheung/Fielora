import typescript from '../../../assets/file-icons/typescript.svg';
import javascript from '../../../assets/file-icons/javascript.svg';
import react from '../../../assets/file-icons/react.svg';
import eslint from '../../../assets/file-icons/eslint.svg';
import html from '../../../assets/file-icons/html.svg';
import css from '../../../assets/file-icons/css.svg';
import json from '../../../assets/file-icons/json.svg';
import yaml from '../../../assets/file-icons/yaml.svg';
import xml from '../../../assets/file-icons/xml.svg';
import markdown from '../../../assets/file-icons/markdown.svg';
import image from '../../../assets/file-icons/image.svg';
import python from '../../../assets/file-icons/python.svg';
import rust from '../../../assets/file-icons/rust.svg';
import vue from '../../../assets/file-icons/vue.svg';
import document from '../../../assets/file-icons/document.svg';

export type FileIconKind = 'typescript' | 'javascript' | 'code' | 'html' | 'style' | 'json' | 'config' | 'markdown' | 'image' | 'file';

function fileIcon(path: string): { kind: FileIconKind; asset: string } {
  const name = path.replaceAll('\\', '/').split('/').at(-1)?.toLocaleLowerCase() ?? '';
  const extension = name.split('.').at(-1) ?? '';
  if (name.includes('eslint')) return { kind: 'config', asset: eslint };
  if (extension === 'tsx' || extension === 'jsx') return { kind: extension === 'tsx' ? 'typescript' : 'javascript', asset: react };
  if (['ts', 'mts', 'cts'].includes(extension)) return { kind: 'typescript', asset: typescript };
  if (['js', 'mjs', 'cjs'].includes(extension)) return { kind: 'javascript', asset: javascript };
  if (extension === 'rs') return { kind: 'code', asset: rust };
  if (extension === 'py') return { kind: 'code', asset: python };
  if (extension === 'html' || extension === 'htm') return { kind: 'html', asset: html };
  if (extension === 'vue') return { kind: 'html', asset: vue };
  if (['css', 'scss', 'sass', 'less'].includes(extension)) return { kind: 'style', asset: css };
  if (extension === 'json' || extension === 'jsonc') return { kind: 'json', asset: json };
  if (extension === 'xml') return { kind: 'config', asset: xml };
  if (['yaml', 'yml', 'toml', 'ini', 'env'].includes(extension)) return { kind: 'config', asset: yaml };
  if (extension === 'md' || extension === 'mdx') return { kind: 'markdown', asset: markdown };
  if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'bmp', 'ico'].includes(extension)) return { kind: 'image', asset: image };
  return { kind: 'file', asset: document };
}

export function FileTypeIcon({ path }: { path: string }) {
  const { kind, asset } = fileIcon(path);
  return <img src={asset} className={`file-type-icon is-${kind}`} data-file-kind={kind} data-file-icon-source="material-icon-theme" alt="" aria-hidden="true" draggable={false}/>;
}
