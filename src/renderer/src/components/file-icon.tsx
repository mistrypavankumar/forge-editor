import {
  FileCode2,
  FileJson,
  FileText,
  FileType,
  FileCog,
  Folder,
  FolderOpen,
  Image,
  type LucideIcon,
} from 'lucide-react';

interface IconSpec {
  Icon: LucideIcon;
  color: string;
}

const BY_EXT: Record<string, IconSpec> = {
  ts: { Icon: FileCode2, color: '#4fa3ff' },
  tsx: { Icon: FileCode2, color: '#4fa3ff' },
  js: { Icon: FileCode2, color: '#e2b340' },
  jsx: { Icon: FileCode2, color: '#e2b340' },
  json: { Icon: FileJson, color: '#e2b340' },
  css: { Icon: FileType, color: '#4fa3ff' },
  scss: { Icon: FileType, color: '#ff6b9d' },
  html: { Icon: FileCode2, color: '#ff7b54' },
  md: { Icon: FileText, color: '#9aa0a6' },
  yml: { Icon: FileCog, color: '#a996f8' },
  yaml: { Icon: FileCog, color: '#a996f8' },
  png: { Icon: Image, color: '#5be49b' },
  jpg: { Icon: Image, color: '#5be49b' },
  svg: { Icon: Image, color: '#5be49b' },
};

const DEFAULT_FILE: IconSpec = { Icon: FileText, color: '#9aa0a6' };

export function FileTypeIcon({ name }: { name: string }): React.JSX.Element {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const { Icon, color } = BY_EXT[ext] ?? DEFAULT_FILE;
  return <Icon size={14} color={color} strokeWidth={1.75} />;
}

export function FolderIcon({ open }: { open: boolean }): React.JSX.Element {
  const Comp = open ? FolderOpen : Folder;
  return <Comp size={14} color="#a996f8" strokeWidth={1.75} />;
}
