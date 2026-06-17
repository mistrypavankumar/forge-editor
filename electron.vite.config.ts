import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } },
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
