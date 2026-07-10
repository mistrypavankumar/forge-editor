import { describe, it, expect, beforeEach } from 'vitest';
import type { BrowserConsoleEvent, BrowserNetworkEvent } from '@shared/ipc-contract';
import {
  sendToApiExplorer,
  askAiToFixConsole,
  isAiConfigured,
} from './browser-debug-actions';
import { useApiExplorerStore } from '../api-explorer/store';
import { useAssistantStore } from '../stores/assistant-store';
import { useAiStore } from '../stores/ai-store';
import { useLayoutStore } from '../stores/layout-store';

function net(partial: Partial<BrowserNetworkEvent>): BrowserNetworkEvent {
  return { id: 'n1', url: 'http://localhost:8080/api/users', method: 'GET', startedAt: 0, type: 'rest', ...partial };
}

describe('sendToApiExplorer', () => {
  beforeEach(() => {
    useApiExplorerStore.setState({ method: 'GET', url: '', params: [], headers: [], bodyMode: 'none', bodyText: '', query: '', variables: '' });
  });

  it('populates a REST request with method, url, params and JSON body', () => {
    sendToApiExplorer(
      net({
        url: 'http://localhost:8080/api/users?page=2&q=bob',
        method: 'post',
        requestHeaders: { 'content-type': 'application/json', authorization: 'Bearer secret', cookie: 'a=b' },
        requestBody: '{"name":"bob"}',
      }),
    );
    const s = useApiExplorerStore.getState();
    expect(s.method).toBe('POST');
    expect(s.url).toBe('http://localhost:8080/api/users?page=2&q=bob');
    expect(s.params.map((p) => [p.key, p.value])).toEqual([
      ['page', '2'],
      ['q', 'bob'],
    ]);
    expect(s.bodyMode).toBe('json');
    expect(s.bodyText).toBe('{"name":"bob"}');
    // Secrets are stripped from headers carried into the editor.
    expect(s.headers.map((h) => h.key.toLowerCase())).toEqual(['content-type']);
  });

  it('populates a GraphQL request in graphql body mode with query + variables', () => {
    sendToApiExplorer(
      net({
        url: 'http://localhost:8080/graphql',
        method: 'POST',
        type: 'graphql',
        requestBody: JSON.stringify({
          operationName: 'GetUsers',
          variables: { limit: 10 },
          query: 'query GetUsers($limit: Int) { users(limit: $limit) { id } }',
        }),
      }),
    );
    const s = useApiExplorerStore.getState();
    expect(s.bodyMode).toBe('graphql');
    expect(s.query).toContain('query GetUsers');
    expect(JSON.parse(s.variables)).toEqual({ limit: 10 });
  });

  it('falls back to text body mode for non-JSON bodies', () => {
    sendToApiExplorer(net({ method: 'POST', requestBody: 'plain text', requestHeaders: {} }));
    expect(useApiExplorerStore.getState().bodyMode).toBe('text');
  });
});

describe('isAiConfigured', () => {
  it('is true for the local claude CLI without any key', async () => {
    useAiStore.setState({ provider: 'claude-cli' });
    expect(await isAiConfigured()).toBe(true);
  });
});

function consoleEvent(partial: Partial<BrowserConsoleEvent>): BrowserConsoleEvent {
  return { id: 'c1', level: 'error', message: 'boom', url: 'http://x/dash', timestamp: 0, ...partial };
}

describe('askAiToFixConsole', () => {
  beforeEach(() => {
    useAssistantStore.setState({ seed: null });
    useLayoutStore.setState({ rightVisible: false, rightMode: 'agent' });
  });

  it('opens the chat panel and seeds a structured fix prompt', async () => {
    await askAiToFixConsole(
      consoleEvent({ message: "Cannot read properties of undefined (reading 'name')", routePath: '/dashboard/users' }),
    );
    const seed = useAssistantStore.getState().seed;
    expect(seed).not.toBeNull();
    expect(seed?.displayText).toContain('Cannot read properties of undefined');
    expect(seed?.promptText).toContain('Route: /dashboard/users');
    expect(seed?.promptText).toContain('Reviewable diff');
    // Assistant panel is revealed in chat mode.
    expect(useLayoutStore.getState().rightVisible).toBe(true);
    expect(useLayoutStore.getState().rightMode).toBe('chat');
  });
});
