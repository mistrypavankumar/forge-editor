export const IpcChannels = {
  ping: 'forge:ping',
} as const;

export interface ForgeApi {
  ping: (msg: string) => Promise<string>;
}

export function pongOf(msg: string): string {
  return `pong: ${msg}`;
}
