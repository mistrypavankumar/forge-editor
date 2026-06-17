import { ModernFileIcon } from './ModernFileIcon';
import { ModernFolderIcon } from './ModernFolderIcon';

/** Back-compat shims so existing imports render the modern icon set. */
export function FileTypeIcon({ name }: { name: string }): React.JSX.Element {
  return <ModernFileIcon name={name} />;
}

export function FolderIcon({ open, name }: { open: boolean; name?: string }): React.JSX.Element {
  return <ModernFolderIcon open={open} name={name} />;
}
