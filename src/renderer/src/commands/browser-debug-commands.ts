import { commandRegistry } from './command-registry';
import { useLayoutStore } from '../stores/layout-store';
import { useBrowserDebugStore } from '../browser/browser-debug-store';
import {
  openConsoleSource,
  openNetworkRelated,
  copyCurl,
  sendToApiExplorer,
  askAiToFixConsole,
  askAiToFixNetwork,
} from '../browser/browser-debug-actions';

/** Reveal the Browser Debug bottom tab. */
function openBrowserDebug(): void {
  useLayoutStore.getState().setBottomTab('browserDebug');
  useLayoutStore.getState().setPanelVisible('bottom', true);
}

/** The currently selected network event, if any. */
function selectedNetwork() {
  const s = useBrowserDebugStore.getState();
  return s.network.find((n) => n.id === s.selectedNetworkId) ?? null;
}

/** Commands for the Browser Debug panel (console/network/GraphQL inspector). */
export function registerBrowserDebugCommands(): void {
  commandRegistry.register({
    id: 'forge.browserDebug.open',
    title: 'Open Browser Debug',
    category: 'Browser Debug',
    run: openBrowserDebug,
  });
  commandRegistry.register({
    id: 'forge.browserDebug.clearConsole',
    title: 'Clear Browser Console',
    category: 'Browser Debug',
    run: () => useBrowserDebugStore.getState().clearConsole(),
  });
  commandRegistry.register({
    id: 'forge.browserDebug.clearNetwork',
    title: 'Clear Browser Network',
    category: 'Browser Debug',
    run: () => useBrowserDebugStore.getState().clearNetwork(),
  });
  commandRegistry.register({
    id: 'forge.browserDebug.openSelectedSource',
    title: 'Open Selected Source',
    category: 'Browser Debug',
    run: () => {
      const s = useBrowserDebugStore.getState();
      const consoleEvent = s.console.find((e) => e.id === s.selectedConsoleId);
      if (consoleEvent) {
        void openConsoleSource(consoleEvent);
        return;
      }
      const net = selectedNetwork();
      if (net) void openNetworkRelated(net);
    },
    isEnabled: () => {
      const s = useBrowserDebugStore.getState();
      return s.selectedConsoleId !== null || s.selectedNetworkId !== null;
    },
  });
  commandRegistry.register({
    id: 'forge.browserDebug.copyAsCurl',
    title: 'Copy Request as cURL',
    category: 'Browser Debug',
    run: () => {
      const net = selectedNetwork();
      if (net) copyCurl(net);
    },
    isEnabled: () => useBrowserDebugStore.getState().selectedNetworkId !== null,
  });
  commandRegistry.register({
    id: 'forge.browserDebug.sendRequestToApiExplorer',
    title: 'Send Request to API Explorer',
    category: 'Browser Debug',
    run: () => {
      const net = selectedNetwork();
      if (net) sendToApiExplorer(net);
    },
    isEnabled: () => useBrowserDebugStore.getState().selectedNetworkId !== null,
  });
  commandRegistry.register({
    id: 'forge.browserDebug.askAiToFix',
    title: 'Ask AI to Fix Browser Error',
    category: 'Browser Debug',
    run: () => {
      const s = useBrowserDebugStore.getState();
      const consoleEvent = s.console.find((e) => e.id === s.selectedConsoleId);
      if (consoleEvent) {
        void askAiToFixConsole(consoleEvent);
        return;
      }
      const net = selectedNetwork();
      if (net) void askAiToFixNetwork(net);
    },
    isEnabled: () => {
      const s = useBrowserDebugStore.getState();
      return s.selectedConsoleId !== null || s.selectedNetworkId !== null;
    },
  });
}
