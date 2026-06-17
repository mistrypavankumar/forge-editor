import { commandRegistry } from './command-registry';
import { usePaletteStore } from '../stores/palette-store';

export function registerPaletteCommands(): void {
  commandRegistry.register({
    id: 'workbench.commandPalette',
    title: 'Command Palette',
    category: 'View',
    run: () => usePaletteStore.getState().openPalette('commands'),
  });
  commandRegistry.register({
    id: 'workbench.quickOpen',
    title: 'Go to File…',
    category: 'File',
    run: () => usePaletteStore.getState().openPalette('files'),
  });
}
