declare global {
  interface Window {
    cwe: Record<string, never>;
  }
}

export {};
