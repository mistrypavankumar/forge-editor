import { commandRegistry } from './command-registry';
import { useEditorStore } from '../stores/editor-store';
import { runGenerateSkeleton } from '../skeleton/actions';

/**
 * Registers `forge.generateSkeleton`. Enabled whenever an editor is active; the friendly
 * "React files only" message for non-.tsx/.jsx files is shown inside the preview modal by
 * `runGenerateSkeleton`, so the command stays discoverable in the palette.
 */
export function registerSkeletonCommands(): void {
  commandRegistry.register({
    id: 'forge.generateSkeleton',
    title: 'Generate Skeleton',
    category: 'Editor',
    run: () => void runGenerateSkeleton(),
    isEnabled: () => useEditorStore.getState().activePath !== null,
  });
}
