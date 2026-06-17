import { Terminal as TerminalIcon } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';

interface OutputPanelProps {
  empty?: string;
}

export function OutputPanel({ empty }: OutputPanelProps): React.JSX.Element {
  return <EmptyState icon={TerminalIcon} title={empty ?? 'No output yet'} />;
}
