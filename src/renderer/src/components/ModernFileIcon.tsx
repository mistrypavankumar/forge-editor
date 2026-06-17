import { Icon } from '@iconify/react';
import { fileIconId } from '../lib/icons';

interface ModernFileIconProps {
  name: string;
  size?: number;
}

export function ModernFileIcon({ name, size = 16 }: ModernFileIconProps): React.JSX.Element {
  return <Icon icon={fileIconId(name)} width={size} height={size} />;
}
