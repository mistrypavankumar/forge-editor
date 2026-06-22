import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Two entries: the main process and the language-service worker thread (emitted as
        // out/main/language.worker.js, spawned by language-client at runtime).
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'language.worker': resolve(__dirname, 'src/main/language/language.worker.ts'),
        },
        // node-pty is native; typescript is large and uses dynamic requires — keep both external
        // so they're require()d from node_modules at runtime instead of bundled.
        external: ['node-pty', 'typescript'],
      },
    },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        // Sandboxed Electron preloads must be CommonJS; emit an unambiguous .cjs.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
    plugins: [react(), tailwindcss()],
  },
});
