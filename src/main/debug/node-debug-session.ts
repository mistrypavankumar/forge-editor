import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { extname, dirname } from 'node:path';
import type {
  DebugConfig,
  DebugOutputEvent,
  DebugStackFrame,
  DebugStateEvent,
  DebugStoppedEvent,
  DebugVariable,
  ResolvedBreakpoint,
  SourceBreakpoint,
} from '@shared/ipc-contract';
import { getActiveAwsEnv } from '../aws/aws-service';
import { CdpClient } from './cdp-client';
import { SourceMapRegistry, pathToUrl } from './source-maps';

const requireFrom = createRequire(import.meta.url);

// ---- CDP shapes (only the fields we read) -----------------------------------

interface RemoteObject {
  type: string;
  subtype?: string;
  className?: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
  objectId?: string;
}
interface PropertyDescriptor {
  name: string;
  value?: RemoteObject;
  get?: RemoteObject;
}
interface Scope {
  type: string;
  name?: string;
  object: RemoteObject;
}
interface CallFrame {
  callFrameId: string;
  functionName: string;
  location: { scriptId: string; lineNumber: number; columnNumber?: number };
  scopeChain: Scope[];
}
interface PausedEvent {
  callFrames: CallFrame[];
  reason: string;
  hitBreakpoints?: string[];
}

export interface SessionCallbacks {
  onState: (e: DebugStateEvent) => void;
  onStopped: (e: DebugStoppedEvent) => void;
  onOutput: (e: DebugOutputEvent) => void;
}

let cachedNodeMajor: number | null = null;
function nodeMajor(): number {
  if (cachedNodeMajor != null) return cachedNodeMajor;
  try {
    const out = execFileSync('node', ['-v'], { encoding: 'utf8' }).trim();
    cachedNodeMajor = Number.parseInt(out.replace(/^v/, '').split('.')[0] ?? '0', 10) || 0;
  } catch {
    cachedNodeMajor = 0;
  }
  return cachedNodeMajor;
}

function hasTsx(cwd: string): boolean {
  try {
    requireFrom.resolve('tsx', { paths: [cwd] });
    return true;
  } catch {
    return false;
  }
}

// Inspector chatter on stderr we don't want to surface as program output.
const INSPECTOR_NOISE = [
  /^Debugger listening on /,
  /^For help, see: https:\/\/nodejs\.org/,
  /^Debugger attached\.?$/,
  /^Waiting for the debugger to disconnect/,
];

function describe(obj: RemoteObject | undefined): string {
  if (!obj) return 'undefined';
  if (obj.unserializableValue) return obj.unserializableValue;
  if (obj.type === 'string') return JSON.stringify(obj.value);
  if (obj.type === 'undefined') return 'undefined';
  if (obj.subtype === 'null') return 'null';
  if (obj.value !== undefined && obj.type !== 'object' && obj.type !== 'function') {
    return String(obj.value);
  }
  return obj.description ?? obj.className ?? obj.type;
}

/** Console-style rendering: strings are unquoted, objects use their preview description. */
function describeForConsole(obj: RemoteObject): string {
  if (obj.type === 'string') return String(obj.value ?? obj.description ?? '');
  return describe(obj);
}

function refFor(obj: RemoteObject | undefined): string {
  if (!obj || !obj.objectId) return '';
  if (obj.subtype === 'null') return '';
  return obj.type === 'object' || obj.type === 'function' ? obj.objectId : '';
}

/**
 * One Node.js debug session: spawns the program under `--inspect-brk`, connects to its V8 inspector
 * over CDP, and exposes breakpoints, stepping, variable inspection, and expression evaluation. One
 * session drives one debuggee; the IPC layer owns its lifetime (one per window).
 */
export class NodeDebugSession {
  private readonly client = new CdpClient();
  private readonly registry = new SourceMapRegistry();
  private child: ChildProcess | null = null;
  private terminated = false;
  /** The artificial entry break from `--inspect-brk` has been auto-resumed past. */
  private entryConsumed = false;
  private paused = false;
  /** Scope chain per paused call frame, so `getVariables(frameId)` can return its scopes. */
  private readonly frameScopes = new Map<string, Scope[]>();
  /** Desired breakpoints: authored file -> set of 1-based lines. */
  private readonly desired = new Map<string, Set<number>>();
  /** CDP breakpoint ids currently set per authored file (so we can replace them). */
  private readonly appliedIds = new Map<string, string[]>();

  constructor(private readonly callbacks: SessionCallbacks) {}

  private buildArgs(program: string, cwd: string, args: string[]): string[] {
    const ext = extname(program).toLowerCase();
    const isTs = ext === '.ts' || ext === '.mts' || ext === '.cts' || ext === '.tsx';
    // JSX (.tsx/.jsx) needs a real transform, not just type erasure — Node's built-in
    // type stripping doesn't recognize these extensions and fails with ERR_UNKNOWN_FILE_EXTENSION.
    // Only the tsx loader can run them.
    const isJsx = ext === '.tsx' || ext === '.jsx';
    const nodeArgs = ['--inspect-brk=127.0.0.1:0', '--enable-source-maps'];
    if (isTs || isJsx) {
      if (hasTsx(cwd)) {
        nodeArgs.push('--import', 'tsx');
      } else if (isJsx) {
        throw new Error(
          `To debug JSX (${ext}) files, install tsx (e.g. \`pnpm add -D tsx\`). ` +
            `Node's built-in type stripping cannot transform JSX.`,
        );
      } else if (nodeMajor() >= 22) {
        // Node 22's loader strips/transforms types in place; with --enable-source-maps the
        // inspector reports a map so breakpoints land on the authored line.
        nodeArgs.push('--experimental-strip-types', '--experimental-transform-types');
      } else {
        throw new Error(
          'To debug TypeScript, install tsx (e.g. `pnpm add -D tsx`) or run with Node 22+.',
        );
      }
    }
    return [...nodeArgs, program, ...args];
  }

  async start(config: DebugConfig, breakpoints: SourceBreakpoint[]): Promise<void> {
    const program = config.program;
    if (!program) throw new Error('No program to debug (open a file or pick a launch configuration).');
    const cwd = config.cwd ?? dirname(program);
    for (const bp of breakpoints) {
      let set = this.desired.get(bp.file);
      if (!set) this.desired.set(bp.file, (set = new Set()));
      set.add(bp.line);
    }

    this.callbacks.onState({ status: 'starting' });
    const args = this.buildArgs(program, cwd, config.args ?? []);
    const child = spawn('node', args, {
      cwd,
      env: { ...process.env, ...getActiveAwsEnv(), ...config.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    let wsUrl: string | null = null;
    let stderrBuffer = '';
    const tryConnect = (text: string): void => {
      if (wsUrl) return;
      const match = text.match(/ws:\/\/[^\s]+/);
      if (match) {
        wsUrl = match[0];
        void this.connect(wsUrl);
      }
    };

    child.stdout?.on('data', (d: Buffer) =>
      this.callbacks.onOutput({ category: 'stdout', text: d.toString() }),
    );
    child.stderr?.on('data', (d: Buffer) => {
      const text = d.toString();
      stderrBuffer += text;
      tryConnect(stderrBuffer);
      // Forward program stderr, line by line, minus the inspector's own startup chatter.
      for (const line of text.split('\n')) {
        if (!line) continue;
        // With --inspect-brk, Node prints this once the program has run to completion and then
        // stays alive waiting for us to detach — so it's our reliable "program finished" signal.
        // Close the session, which disconnects the socket and lets the process exit.
        if (/Waiting for the debugger to disconnect/.test(line)) {
          this.handleExit();
          return;
        }
        if (INSPECTOR_NOISE.some((re) => re.test(line))) continue;
        this.callbacks.onOutput({ category: 'stderr', text: line + '\n' });
      }
    });
    child.on('error', (e) => {
      this.callbacks.onOutput({ category: 'stderr', text: `Failed to launch: ${e.message}\n` });
      this.handleExit();
    });
    child.on('exit', (code) => {
      if (code != null && code !== 0 && !this.terminated) {
        this.callbacks.onOutput({ category: 'stderr', text: `Process exited with code ${code}.\n` });
      }
      this.handleExit();
    });
  }

  private async connect(url: string): Promise<void> {
    try {
      await this.client.connect(url);
    } catch (e) {
      this.callbacks.onOutput({
        category: 'stderr',
        text: `Could not attach debugger: ${e instanceof Error ? e.message : String(e)}\n`,
      });
      this.handleExit();
      return;
    }

    this.client.on('Debugger.scriptParsed', (p) => this.onScriptParsed(p as never));
    this.client.on('Debugger.paused', (p) => this.onPaused(p as PausedEvent));
    this.client.on('Runtime.consoleAPICalled', (p) => this.onConsole(p as never));
    this.client.on('Runtime.exceptionThrown', (p) => this.onException(p as never));
    this.client.on('socket-close', () => this.handleExit());

    await this.client.send('Runtime.enable');
    await this.client.send('Debugger.enable');
    await this.client.send('Debugger.setPauseOnExceptions', { state: 'none' });
    // Arm the initial breakpoints (identity until each owning script parses and re-binds).
    await Promise.all([...this.desired.keys()].map((file) => this.applyFile(file)));
    await this.client.send('Runtime.runIfWaitingForDebugger');
  }

  private onScriptParsed(p: { scriptId: string; url: string; sourceMapURL?: string }): void {
    this.registry.register(p.scriptId, p.url, p.sourceMapURL);
    // Re-bind any desired breakpoints this newly-parsed script covers, upgrading the identity
    // breakpoints set before launch to source-map-accurate locations.
    if (this.desired.size === 0) return;
    const affected = new Set<string>();
    for (const file of this.desired.keys()) {
      if (this.registry.scriptsForAuthored(file).includes(p.scriptId)) affected.add(file);
    }
    for (const file of affected) void this.applyFile(file);
  }

  /** Replace every CDP breakpoint for `file` with one per desired line; returns their bound state. */
  private async applyFile(file: string): Promise<ResolvedBreakpoint[]> {
    const old = this.appliedIds.get(file) ?? [];
    await Promise.all(
      old.map((id) => this.client.send('Debugger.removeBreakpoint', { breakpointId: id }).catch(() => {})),
    );
    const ids: string[] = [];
    const resolved: ResolvedBreakpoint[] = [];
    const lines = [...(this.desired.get(file) ?? [])].sort((a, b) => a - b);
    for (const line of lines) {
      const candidates = this.registry.authoredToGenerated(file, line);
      // No parsed script maps this file yet: set an identity breakpoint on the file URL; Node binds
      // it when the script loads (correct for JS / type-stripping, re-bound later for source maps).
      const target = candidates[0] ?? { url: pathToUrl(file), lineNumber: line - 1, columnNumber: 0 };
      try {
        const res = await this.client.send<{ breakpointId: string; locations: unknown[] }>(
          'Debugger.setBreakpointByUrl',
          { url: target.url, lineNumber: target.lineNumber, columnNumber: target.columnNumber },
        );
        ids.push(res.breakpointId);
        resolved.push({ file, line, verified: (res.locations?.length ?? 0) > 0 });
      } catch {
        resolved.push({ file, line, verified: false });
      }
    }
    this.appliedIds.set(file, ids);
    return resolved;
  }

  async setBreakpoints(file: string, lines: number[]): Promise<ResolvedBreakpoint[]> {
    if (lines.length === 0) this.desired.delete(file);
    else this.desired.set(file, new Set(lines));
    if (this.terminated) return lines.map((line) => ({ file, line, verified: false }));
    return this.applyFile(file);
  }

  private onPaused(p: PausedEvent): void {
    // The first pause is the synthetic --inspect-brk break at the program's first line. Unless a
    // real breakpoint sits there, resume past it so the program runs to a user breakpoint.
    if (!this.entryConsumed) {
      this.entryConsumed = true;
      const realStop = (p.hitBreakpoints?.length ?? 0) > 0 || p.reason === 'exception';
      if (!realStop) {
        void this.client.send('Debugger.resume');
        this.callbacks.onState({ status: 'running' });
        return;
      }
    }

    this.paused = true;
    this.frameScopes.clear();
    const frames: DebugStackFrame[] = p.callFrames.map((cf) => {
      this.frameScopes.set(cf.callFrameId, cf.scopeChain);
      const loc = this.registry.generatedToAuthored(
        cf.location.scriptId,
        cf.location.lineNumber,
        cf.location.columnNumber ?? 0,
      );
      return {
        id: cf.callFrameId,
        name: cf.functionName || '(anonymous)',
        file: loc?.file ?? null,
        line: loc?.line ?? 0,
        column: loc?.column ?? 0,
      };
    });
    const top = frames.find((f) => f.file);
    const reason: DebugStoppedEvent['reason'] =
      p.reason === 'exception' || p.reason === 'promiseRejection'
        ? 'exception'
        : (p.hitBreakpoints?.length ?? 0) > 0
          ? 'breakpoint'
          : 'step';
    this.callbacks.onState({ status: 'paused' });
    this.callbacks.onStopped({
      reason,
      frames,
      topFile: top?.file ?? null,
      topLine: top?.line ?? 0,
    });
  }

  private onConsole(p: { type: string; args: RemoteObject[] }): void {
    const text = (p.args ?? []).map(describeForConsole).join(' ');
    this.callbacks.onOutput({ category: 'console', text: text + '\n' });
  }

  private onException(p: { exceptionDetails?: { exception?: RemoteObject; text?: string } }): void {
    const d = p.exceptionDetails;
    const text = d?.exception ? describe(d.exception) : (d?.text ?? 'Uncaught exception');
    this.callbacks.onOutput({ category: 'stderr', text: text + '\n' });
  }

  private resumeState(): void {
    this.paused = false;
    this.frameScopes.clear();
    this.callbacks.onState({ status: 'running' });
  }

  resume(): void {
    if (!this.paused) return;
    void this.client.send('Debugger.resume');
    this.resumeState();
  }
  pause(): void {
    void this.client.send('Debugger.pause').catch(() => {});
  }
  stepOver(): void {
    if (!this.paused) return;
    void this.client.send('Debugger.stepOver');
    this.resumeState();
  }
  stepInto(): void {
    if (!this.paused) return;
    void this.client.send('Debugger.stepInto');
    this.resumeState();
  }
  stepOut(): void {
    if (!this.paused) return;
    void this.client.send('Debugger.stepOut');
    this.resumeState();
  }

  async getVariables(reference: string): Promise<DebugVariable[]> {
    // A call-frame id resolves to that frame's scopes; an object id resolves to its properties.
    const scopes = this.frameScopes.get(reference);
    if (scopes) {
      return scopes
        .filter((s) => s.object.objectId)
        .map((s) => ({
          name: s.name || s.type.charAt(0).toUpperCase() + s.type.slice(1),
          value: s.type,
          type: 'scope',
          reference: s.object.objectId ?? '',
        }));
    }
    const res = await this.client.send<{ result: PropertyDescriptor[] }>('Runtime.getProperties', {
      objectId: reference,
      ownProperties: true,
      generatePreview: true,
    });
    return (res.result ?? [])
      .filter((d) => d.value || d.get)
      .map((d) => {
        const obj = d.value ?? { type: 'function', description: '(...)' };
        return {
          name: d.name,
          value: d.value ? describe(obj) : '(getter)',
          type: obj.subtype ?? obj.type,
          reference: refFor(d.value),
        };
      });
  }

  async evaluate(expression: string, frameId?: string): Promise<string> {
    const usingFrame = this.paused && frameId && this.frameScopes.has(frameId);
    const res = usingFrame
      ? await this.client.send<{ result: RemoteObject; exceptionDetails?: { exception?: RemoteObject; text?: string } }>(
          'Debugger.evaluateOnCallFrame',
          { callFrameId: frameId, expression, generatePreview: true, silent: true },
        )
      : await this.client.send<{ result: RemoteObject; exceptionDetails?: { exception?: RemoteObject; text?: string } }>(
          'Runtime.evaluate',
          { expression, includeCommandLineAPI: true, generatePreview: true, silent: true },
        );
    if (res.exceptionDetails) {
      return res.exceptionDetails.exception
        ? describe(res.exceptionDetails.exception)
        : (res.exceptionDetails.text ?? 'Evaluation error');
    }
    return describe(res.result);
  }

  private handleExit(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.paused = false;
    this.frameScopes.clear();
    this.registry.clear();
    this.client.close();
    if (this.child && !this.child.killed) {
      try {
        this.child.kill();
      } catch {
        // already gone
      }
    }
    this.child = null;
    this.callbacks.onState({ status: 'terminated' });
  }

  stop(): void {
    this.handleExit();
  }
}
