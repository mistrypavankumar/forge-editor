import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerCoreCommands } from './commands/core-commands';
import { registerPaletteCommands } from './commands/palette-commands';
import { registerThemeCommands } from './commands/theme-commands';
import { registerDebugCommands } from './commands/debug-commands';
import { registerAgentCommands } from './commands/agent-commands';
import { registerSkeletonCommands } from './commands/skeleton-commands';
import { registerBrowserCommands } from './commands/browser-commands';
import { registerBrowserDebugCommands } from './commands/browser-debug-commands';
import { registerScreenshotCommands } from './commands/screenshot-commands';
import { initDebugStore } from './stores/debug-store';
// Inter is the UI font for all chrome (everything except the code editor, which uses mono).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/fira-code/400.css';
import '@xterm/xterm/css/xterm.css';
import 'allotment/dist/style.css';
import './styles/global.css';

registerCoreCommands();
registerPaletteCommands();
registerThemeCommands();
registerDebugCommands();
registerAgentCommands();
registerSkeletonCommands();
registerBrowserCommands();
registerBrowserDebugCommands();
registerScreenshotCommands();
// Bind the main-process debug session's events into the store for the app's lifetime.
initDebugStore();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
