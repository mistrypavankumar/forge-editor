import { Icon } from '@iconify/react';
import { folderIconId } from '../lib/icons';

export type FolderCategory =
  | 'apps'
  | 'packages'
  | 'services'
  | 'config'
  | 'docs'
  | 'scripts'
  | 'hidden'
  | 'generic';

interface ModernFolderIconProps {
  category?: FolderCategory;
  name?: string;
  open?: boolean;
  size?: number;
}

export function ModernFolderIcon({
  category,
  name,
  open = false,
  size = 16,
}: ModernFolderIconProps): React.JSX.Element {
  return <Icon icon={folderIconId({ name, category, open })} width={size} height={size} />;
}
