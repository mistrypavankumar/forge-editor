import { commandRegistry } from './command-registry';
import { useLayoutStore } from '../stores/layout-store';
import { useAgentStore } from '../stores/agent-store';

/** Reveal the right dock in Agent mode. */
function openAgent(): void {
  const l = useLayoutStore.getState();
  l.setRightMode('agent');
  l.setPanelVisible('right', true);
}

export function registerAgentCommands(): void {
  commandRegistry.register({
    id: 'ai.openAgent',
    title: 'AI Agent: Open Agent Workspace',
    category: 'AI',
    run: openAgent,
  });
  commandRegistry.register({
    id: 'ai.openChat',
    title: 'AI Assistant: Open Chat',
    category: 'AI',
    run: () => {
      const l = useLayoutStore.getState();
      l.setRightMode('chat');
      l.setPanelVisible('right', true);
    },
  });
  commandRegistry.register({
    id: 'ai.toggleAgentEnabled',
    title: 'AI Agent: Enable/Disable Agent Mode',
    category: 'AI',
    run: () => {
      const a = useAgentStore.getState();
      a.setEnabled(!a.enabled);
    },
  });
}
