import type { IpcMain, WebContents } from 'electron';
import { IpcChannels, type DebugConfig, type SourceBreakpoint } from '@shared/ipc-contract';
import { toResult } from '@shared/result';
import { NodeDebugSession } from './node-debug-session';

/**
 * Wire the Node step debugger into IPC. Each window (WebContents) drives at most one live session;
 * the session forwards its state/stopped/output events back to the window that started it. Control
 * messages (resume/step/pause) are fire-and-forget; the rest answer with a `Result`.
 */
export function registerDebugIpc(ipcMain: IpcMain): void {
  const sessions = new Map<number, NodeDebugSession>();

  const sessionFor = (sender: WebContents): NodeDebugSession | undefined => sessions.get(sender.id);

  const dispose = (id: number): void => {
    sessions.get(id)?.stop();
    sessions.delete(id);
  };

  ipcMain.handle(IpcChannels.debugStart, (e, config: DebugConfig, breakpoints: SourceBreakpoint[]) =>
    toResult(async () => {
      const sender = e.sender;
      // Tear down any previous session for this window before starting a new one.
      dispose(sender.id);
      const session = new NodeDebugSession({
        onState: (event) => {
          if (!sender.isDestroyed()) sender.send(IpcChannels.debugState, event);
          if (event.status === 'terminated') sessions.delete(sender.id);
        },
        onStopped: (event) => {
          if (!sender.isDestroyed()) sender.send(IpcChannels.debugStopped, event);
        },
        onOutput: (event) => {
          if (!sender.isDestroyed()) sender.send(IpcChannels.debugOutput, event);
        },
      });
      sessions.set(sender.id, session);
      // Kill the session if the window goes away mid-debug.
      sender.once('destroyed', () => dispose(sender.id));
      await session.start(config, breakpoints);
    }),
  );

  ipcMain.handle(IpcChannels.debugStop, (e) =>
    toResult(async () => {
      dispose(e.sender.id);
    }),
  );

  ipcMain.on(IpcChannels.debugContinue, (e) => sessionFor(e.sender)?.resume());
  ipcMain.on(IpcChannels.debugPause, (e) => sessionFor(e.sender)?.pause());
  ipcMain.on(IpcChannels.debugStepOver, (e) => sessionFor(e.sender)?.stepOver());
  ipcMain.on(IpcChannels.debugStepInto, (e) => sessionFor(e.sender)?.stepInto());
  ipcMain.on(IpcChannels.debugStepOut, (e) => sessionFor(e.sender)?.stepOut());

  ipcMain.handle(IpcChannels.debugSetBreakpoints, (e, file: string, lines: number[]) =>
    toResult(async () => (await sessionFor(e.sender)?.setBreakpoints(file, lines)) ?? []),
  );

  ipcMain.handle(IpcChannels.debugEvaluate, (e, expression: string, frameId?: string) =>
    toResult(async () => (await sessionFor(e.sender)?.evaluate(expression, frameId)) ?? ''),
  );

  ipcMain.handle(IpcChannels.debugGetVariables, (e, reference: string) =>
    toResult(async () => (await sessionFor(e.sender)?.getVariables(reference)) ?? []),
  );
}
