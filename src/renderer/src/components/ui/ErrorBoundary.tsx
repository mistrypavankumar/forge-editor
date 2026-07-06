import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  /** Shown in the fallback header (e.g. "Agent panel"). */
  label: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/runtime errors in a subtree so one broken panel can't take down the whole window.
 * Used to wrap new feature panels (starting with the Agent panel).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in the devtools console; the fallback covers the user-facing case.
    console.error(`[${this.props.label}] crashed:`, error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <AlertTriangle size={22} strokeWidth={1.5} className="text-danger" />
          <p className="text-[13px] text-muted">{this.props.label} hit an error</p>
          <p className="max-w-[260px] break-words text-[11px] text-faint">{this.state.error.message}</p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-1 rounded-md bg-surface-3 px-3 py-1 text-[11px] text-fg transition-colors hover:bg-surface-2"
          >
            Reload panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
