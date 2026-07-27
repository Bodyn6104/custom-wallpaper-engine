import type { GenerationResult } from '../../core/generation/types';

declare global {
  interface Window {
    cwe: {
      generateScene: (prompt: string) => Promise<GenerationResult>;
    };
  }
}

export {};
