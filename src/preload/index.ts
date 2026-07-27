// src/preload/index.ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('cwe', {});
