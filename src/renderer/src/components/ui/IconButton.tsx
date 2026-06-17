import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label: string;
}

export function IconButton({
  active = false,
  label,
  className,
  children,
  ...rest
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'no-drag inline-flex items-center justify-center rounded-md text-faint',
        'transition-colors hover:bg-surface-3 hover:text-fg',
        active && 'bg-surface-3 text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
