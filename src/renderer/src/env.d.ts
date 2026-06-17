/// <reference types="vite/client" />
import type { ForgeApi } from '@shared/ipc-contract';

declare global {
  interface Window {
    forge: ForgeApi;
  }
}

export {};
