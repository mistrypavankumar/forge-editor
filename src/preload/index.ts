import { contextBridge } from 'electron';
import { api } from './api';

contextBridge.exposeInMainWorld('forge', api);
