import type { GenerationResult } from '../../core/generation/types';

declare global {
  interface Window {
    cwe: {
      generateScene: (prompt: string) => Promise<GenerationResult>;
      applyWallpaper: (result: GenerationResult) => Promise<{ appliedPath: string }>;
    };
  }
}

export {};
