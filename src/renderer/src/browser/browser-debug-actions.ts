import type { BrowserConsoleEvent, BrowserNetworkEvent, CodeNode } from '@shared/ipc-contract';
import { openFilePath, openApiExplorer } from '../lib/workspace-actions';
import { useEditorStore } from '../stores/editor-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useLayoutStore } from '../stores/layout-store';
import { useSearchStore } from '../stores/search-store';
import { useApiExplorerStore } from '../api-explorer/store';
import type { HttpMethod, BodyMode, HeaderRow, ParamRow } from '../api-explorer/types';
import { useAssistantStore } from '../stores/assistant-store';
import { useAiStore } from '../stores/ai-store';
import { languageFor } from '../editor/language';
import { useBrowserDebugStore } from './browser-debug-store';
import { resolveErrorSource } from './stack';
import { matchRouteFile, matchGqlOperation } from './resolver';
import { parseGraphQL, toCurl } from './network';

/**
 * Side-effecting actions shared by the Browser Debug panel and its command-palette commands:
 * mapping a captured error/request back to a source file (reusing the same resolver strategies as
 * the click-to-source inspector) and the copy/search helpers.
 */

// Codemap node cache keyed by workspace root. Building the map is memoized in main, but caching the
// nodes here avoids an IPC round-trip per action.
let nodesCache: { root: string; nodes: CodeNode[] } | null = null;

export async function getNodes(root: string | null): Promise<CodeNode[] | null> {
  if (!root) return null;
  if (nodesCache?.root === root) return nodesCache.nodes;
  const res = await window.forge.codemapBuild(root);
  if (res.ok) {
    nodesCache = { root, nodes: res.data.nodes };
    return res.data.nodes;
  }
  return nodesCache?.nodes ?? null;
}

/** Open a file at a 1-based line/column, reusing the editor's standard open+reveal flow. */
export function openAt(path: string, line: number, column: number): void {
  void openFilePath(path).then(() =>
    useEditorStore.getState().requestReveal({ path, line, col: column }),
  );
}

export interface OpenOutcome {
  opened: boolean;
  /** How the source was located, for a status message. */
  via?: 'stack' | 'route' | 'graphql';
}

/**
 * Open the source for a console error: Strategy 1 (stack trace → source), falling back to
 * Strategy 4 (route URL → Next.js route file).
 */
export async function openConsoleSource(e: BrowserConsoleEvent): Promise<OpenOutcome> {
  const root = useWorkspaceStore.getState().rootPath;
  const loc = resolveErrorSource(e.stack, e.source, root);
  if (loc) {
    openAt(loc.path, loc.line, loc.column);
    return { opened: true, via: 'stack' };
  }
  const nodes = await getNodes(root);
  const rf = nodes ? matchRouteFile(e.routePath ?? e.url, nodes) : null;
  if (rf) {
    openAt(rf.path, rf.line, rf.column);
    return { opened: true, via: 'route' };
  }
  return { opened: false };
}

/** Open the Next.js route file for a captured event's route/URL, if resolvable. */
export async function openRouteFile(routeOrUrl: string | undefined): Promise<boolean> {
  const root = useWorkspaceStore.getState().rootPath;
  const nodes = await getNodes(root);
  const rf = nodes ? matchRouteFile(routeOrUrl ?? '/', nodes) : null;
  if (rf) {
    openAt(rf.path, rf.line, rf.column);
    return true;
  }
  return false;
}

/**
 * Open the likely source behind a network request: for GraphQL, the file defining the operation
 * (Strategy 3); otherwise the route file for the current page (Strategy 4).
 */
export async function openNetworkRelated(net: BrowserNetworkEvent): Promise<OpenOutcome> {
  const root = useWorkspaceStore.getState().rootPath;
  const nodes = await getNodes(root);
  if (net.type === 'graphql' && nodes) {
    const opName = parseGraphQL(net.requestBody)?.primary.operationName;
    const matches = opName ? matchGqlOperation(opName, nodes) : [];
    if (matches.length) {
      openAt(matches[0].path, 1, 1);
      return { opened: true, via: 'graphql' };
    }
  }
  const rf = nodes ? matchRouteFile(net.routePath ?? net.url, nodes) : null;
  if (rf) {
    openAt(rf.path, rf.line, rf.column);
    return { opened: true, via: 'route' };
  }
  return { opened: false };
}

/** The files that import the file defining a GraphQL operation (its likely call sites). */
export async function gqlUsageFiles(
  operationName: string | undefined,
): Promise<{ rel: string; path: string }[]> {
  if (!operationName) return [];
  const nodes = await getNodes(useWorkspaceStore.getState().rootPath);
  if (!nodes) return [];
  const matches = matchGqlOperation(operationName, nodes);
  const seen = new Map<string, string>();
  for (const m of matches) for (const u of m.usedBy) seen.set(u.rel, u.path);
  return [...seen].map(([rel, path]) => ({ rel, path }));
}

export function copyText(text: string): void {
  void navigator.clipboard?.writeText(text);
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
// Headers we never carry into the editor: secrets (user re-adds if needed) and browser-managed ones.
const UNSAFE_OR_MANAGED_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'content-length', 'host',
]);

function toMethod(m: string): HttpMethod {
  const up = m.toUpperCase() as HttpMethod;
  return HTTP_METHODS.includes(up) ? up : 'GET';
}

/** Parse a URL's query string into API-Explorer param rows (kept consistent with the full url). */
function paramRows(rawUrl: string): ParamRow[] {
  try {
    const u = new URL(rawUrl, 'http://localhost');
    const rows: ParamRow[] = [];
    let i = 0;
    u.searchParams.forEach((value, key) => {
      rows.push({ id: `aep-bd-${i++}`, key, value, enabled: true });
    });
    return rows;
  } catch {
    return [];
  }
}

function toHeaderRows(headers: Record<string, string> | undefined): HeaderRow[] {
  if (!headers) return [];
  return Object.entries(headers)
    .filter(([k]) => !UNSAFE_OR_MANAGED_HEADERS.has(k.toLowerCase()))
    .map(([key, value], i) => ({ id: `aeh-bd-${i}`, key, value }));
}

/**
 * Prepare a captured request in the API Explorer as the live request (opens/focuses its tab). Does
 * NOT send it — the user runs it. Secret/auth headers are dropped rather than leaked into the
 * editor; GraphQL requests populate the graphql body mode with the operation + variables.
 */
export function sendToApiExplorer(net: BrowserNetworkEvent): void {
  openApiExplorer();
  const s = useApiExplorerStore.getState();
  s.setMethod(toMethod(net.method));
  s.setUrl(net.url);
  s.setParams(paramRows(net.url));
  s.setHeaders(toHeaderRows(net.requestHeaders));

  if (net.type === 'graphql') {
    const parsed = parseGraphQL(net.requestBody);
    s.setBodyMode('graphql');
    s.setQuery(parsed?.primary.query ?? net.requestBody ?? '');
    s.setVariables(
      parsed?.primary.variables !== undefined
        ? JSON.stringify(parsed.primary.variables, null, 2)
        : '{}',
    );
  } else if (net.requestBody) {
    let mode: BodyMode = 'text';
    try {
      JSON.parse(net.requestBody);
      mode = 'json';
    } catch {
      /* not JSON — keep text */
    }
    s.setBodyMode(mode);
    s.setBodyText(net.requestBody);
  } else {
    s.setBodyMode('none');
  }
}

export function copyCurl(net: BrowserNetworkEvent, includeSensitive?: boolean): void {
  // Default to the user's redaction setting; an explicit `includeSensitive` overrides it.
  const redact = useBrowserDebugStore.getState().redactSensitiveHeaders;
  copyText(toCurl(net, includeSensitive ?? !redact));
}

/** Seed the Search panel with a query and focus it. */
export function searchInProject(query: string): void {
  useSearchStore.getState().setSeed(query);
  useLayoutStore.getState().setActivity('search');
  useLayoutStore.getState().setPanelVisible('sidebar', true);
}

// ── Ask AI to Fix ──────────────────────────────────────────────────────────
// Builds a debug context, attaches the resolved source file, and hands the prompt to the existing
// Assistant chat (never auto-applies — the model returns a reviewable diff the user decides on).

/** Whether an AI provider is usable: the local CLI needs no key; anthropic/openai need one set. */
export async function isAiConfigured(): Promise<boolean> {
  const provider = useAiStore.getState().provider;
  if (provider === 'claude-cli') return true;
  const res = await window.forge.aiKeyStatus();
  return res.ok ? !!res.data[provider] : false;
}

/** Read a file into an assistant context attachment, or null when unreadable. */
async function readContextFile(
  path: string,
): Promise<{ name: string; language: string; content: string } | null> {
  const res = await window.forge.readFile(path);
  if (!res.ok || typeof res.data !== 'string') return null;
  const name = path.split('/').pop() ?? path;
  return { name, language: languageFor(name), content: res.data };
}

/** A short digest of recent console/network activity to orient the model. */
function recentActivity(): string {
  const s = useBrowserDebugStore.getState();
  const recentConsole = s.console
    .slice(-5)
    .map((e) => `- [${e.level}] ${e.message.slice(0, 160)}`)
    .join('\n');
  const recentNet = s.network
    .slice(-5)
    .map((n) => `- ${n.method.toUpperCase()} ${n.url} → ${n.error ?? n.status ?? '?'}`)
    .join('\n');
  const parts: string[] = [];
  if (recentConsole) parts.push(`Recent console:\n${recentConsole}`);
  if (recentNet) parts.push(`Recent network:\n${recentNet}`);
  return parts.length ? `\n## Recent activity\n${parts.join('\n\n')}\n` : '';
}

const RESPONSE_INSTRUCTIONS = `Respond with:
1. **Likely cause** — the most probable root cause.
2. **Files to inspect** — the files/functions to look at.
3. **Suggested patch** — the concrete change to make.
4. **Reviewable diff** — a unified diff I can review before applying (do not assume it is applied).`;

/** Open the Assistant chat panel and hand it a prepared prompt + optional file context. */
function askAssistant(seed: {
  displayText: string;
  promptText: string;
  file?: { name: string; language: string; content: string } | null;
}): void {
  useLayoutStore.getState().setRightMode('chat');
  useLayoutStore.getState().setPanelVisible('right', true);
  useAssistantStore.getState().setSeed(seed);
}

/** Ask the AI to fix a captured console error (attaches the resolved source file when found). */
export async function askAiToFixConsole(e: BrowserConsoleEvent): Promise<void> {
  const loc = resolveErrorSource(e.stack, e.source, useWorkspaceStore.getState().rootPath);
  const file = loc ? await readContextFile(loc.path) : null;
  const promptText = [
    "I'm debugging my web app in Forge's embedded browser. A runtime error was captured — help me fix it.",
    '',
    '## Error',
    e.message,
    `Level: ${e.level}`,
    `Route: ${e.routePath ?? 'unknown'}`,
    loc ? `Source: ${loc.path}:${loc.line}:${loc.column}` : 'Source: could not be resolved from the stack trace',
    '',
    '## Stack trace',
    e.stack ?? '(none captured)',
    recentActivity(),
    file ? 'The related source file is attached as context.' : '',
    '',
    RESPONSE_INSTRUCTIONS,
  ].join('\n');
  askAssistant({ displayText: `Fix: ${e.message.slice(0, 80)}`, promptText, file });
}

/** Ask the AI why a captured request failed (attaches the related source file when found). */
export async function askAiToFixNetwork(net: BrowserNetworkEvent): Promise<void> {
  const nodes = await getNodes(useWorkspaceStore.getState().rootPath);
  const gql = net.type === 'graphql' ? parseGraphQL(net.requestBody)?.primary : undefined;

  let file: { name: string; language: string; content: string } | null = null;
  if (gql?.operationName && nodes) {
    const m = matchGqlOperation(gql.operationName, nodes);
    if (m.length) file = await readContextFile(m[0].path);
  }
  if (!file && nodes) {
    const rf = matchRouteFile(net.routePath ?? net.url, nodes);
    if (rf) file = await readContextFile(rf.path);
  }

  const label = gql?.operationName
    ? `${gql.operationType ?? 'operation'} ${gql.operationName}`
    : `${net.method.toUpperCase()} ${net.url}`;
  const promptText = [
    "I'm debugging my web app in Forge's embedded browser. A network request failed or behaved unexpectedly — help me diagnose and fix it.",
    '',
    '## Request',
    `${net.method.toUpperCase()} ${net.url}`,
    `Status: ${net.error ? `failed (${net.error})` : `${net.status ?? '?'} ${net.statusText ?? ''}`}`,
    `Type: ${net.type}`,
    `Route: ${net.routePath ?? 'unknown'}`,
    gql ? `\nGraphQL operation: ${gql.operationName ?? '(anonymous)'} (${gql.operationType})` : '',
    gql?.query ? `\n## Query\n${gql.query}` : '',
    gql?.variables !== undefined ? `\n## Variables\n${safeStringify(gql.variables)}` : '',
    net.requestBody && !gql ? `\n## Request body\n${net.requestBody.slice(0, 2000)}` : '',
    net.responseBody ? `\n## Response body (preview)\n${net.responseBody.slice(0, 2000)}` : '',
    recentActivity(),
    file ? 'The related source file is attached as context.' : '',
    '',
    RESPONSE_INSTRUCTIONS,
  ].join('\n');
  askAssistant({ displayText: `Why did ${label} fail?`, promptText, file });
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
