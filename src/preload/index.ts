// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { GenerationResult } from '../core/generation/types';

contextBridge.exposeInMainWorld('cwe', {
  generateScene: (prompt: string): Promise<GenerationResult> =>
    ipcRenderer.invoke('generate-scene', prompt),
});
