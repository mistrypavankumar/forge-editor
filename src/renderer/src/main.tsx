import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerCoreCommands } from './commands/core-commands';
import 'allotment/dist/style.css';
import './styles/global.css';

registerCoreCommands();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
