import { commandRegistry } from './command-registry';
import { useDebugStore } from '../stores/debug-store';
import { getActiveEditor } from '../editor/active-editor';

const isActive = (): boolean => {
  const s = useDebugStore.getState().status;
  return s !== 'inactive' && s !== 'terminated';
};
const isPaused = (): boolean => useDebugStore.getState().status === 'paused';

/** Register the debugger commands (also reachable from the command palette). */
export function registerDebugCommands(): void {
  commandRegistry.register({
    id: 'debug.startOrContinue',
    title: 'Debug: Start / Continue',
    category: 'Debug',
    // F5 doubles as start (when idle) and continue (when paused) — VS Code's behaviour.
    run: () => {
      const store = useDebugStore.getState();
      if (store.status === 'paused') store.resume();
      else if (!isActive()) void store.start();
    },
  });
  commandRegistry.register({
    id: 'debug.stop',
    title: 'Debug: Stop',
    category: 'Debug',
    run: () => useDebugStore.getState().stop(),
    isEnabled: isActive,
  });
  commandRegistry.register({
    id: 'debug.pause',
    title: 'Debug: Pause',
    category: 'Debug',
    run: () => useDebugStore.getState().pause(),
    isEnabled: () => isActive() && !isPaused(),
  });
  commandRegistry.register({
    id: 'debug.stepOver',
    title: 'Debug: Step Over',
    category: 'Debug',
    run: () => useDebugStore.getState().stepOver(),
    isEnabled: isPaused,
  });
  commandRegistry.register({
    id: 'debug.stepInto',
    title: 'Debug: Step Into',
    category: 'Debug',
    run: () => useDebugStore.getState().stepInto(),
    isEnabled: isPaused,
  });
  commandRegistry.register({
    id: 'debug.stepOut',
    title: 'Debug: Step Out',
    category: 'Debug',
    run: () => useDebugStore.getState().stepOut(),
    isEnabled: isPaused,
  });
  commandRegistry.register({
    id: 'debug.toggleBreakpoint',
    title: 'Debug: Toggle Breakpoint',
    category: 'Debug',
    run: () => {
      const editor = getActiveEditor();
      const model = editor?.getModel();
      const line = editor?.getPosition()?.lineNumber;
      if (model && line) useDebugStore.getState().toggleBreakpoint(model.uri.path, line);
    },
    isEnabled: () => !!getActiveEditor()?.getModel(),
  });
}
