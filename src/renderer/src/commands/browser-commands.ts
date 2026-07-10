import { commandRegistry } from './command-registry';
import { openBrowser } from '../lib/workspace-actions';
import { useBrowserStore, getBrowserController } from '../browser/store';

/** Commands for the embedded Browser + component inspector. */
export function registerBrowserCommands(): void {
  commandRegistry.register({
    id: 'forge.browser.open',
    title: 'Open Browser',
    category: 'Browser',
    run: () => openBrowser(),
  });
  commandRegistry.register({
    id: 'forge.browser.toggleInspectMode',
    title: 'Toggle Browser Inspect Mode',
    category: 'Browser',
    run: () => {
      openBrowser();
      useBrowserStore.getState().toggleInspectMode();
    },
  });
  commandRegistry.register({
    id: 'forge.browser.openSelectedElementSource',
    title: 'Open Selected Element Source',
    category: 'Browser',
    run: () => getBrowserController()?.openSelectedSource(),
    isEnabled: () => useBrowserStore.getState().selection !== null,
  });
  commandRegistry.register({
    id: 'forge.browser.refresh',
    title: 'Refresh Browser',
    category: 'Browser',
    run: () => getBrowserController()?.reload(),
  });
  commandRegistry.register({
    id: 'forge.browser.back',
    title: 'Browser Back',
    category: 'Browser',
    run: () => getBrowserController()?.back(),
  });
  commandRegistry.register({
    id: 'forge.browser.forward',
    title: 'Browser Forward',
    category: 'Browser',
    run: () => getBrowserController()?.forward(),
  });
}
