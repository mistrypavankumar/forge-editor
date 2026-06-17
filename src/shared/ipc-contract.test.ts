import { describe, expect, it } from 'vitest';
import { IpcChannels, pongOf } from './ipc-contract';

describe('ipc-contract', () => {
  it('exposes a stable ping channel name', () => {
    expect(IpcChannels.ping).toBe('forge:ping');
  });

  it('pongOf echoes the message with a pong prefix', () => {
    expect(pongOf('hello')).toBe('pong: hello');
  });
});
