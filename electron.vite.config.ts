// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    // The main process reaches @anthropic-ai/sdk and, via the generation engine,
    // the native `gl` addon. Both must stay external — vite cannot bundle a .node
    // binary, and the SDK does not need bundling here.
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: { entry: 'src/main/index.ts' },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      // package.json sets "type": "module", so the default preload output would be
      // index.mjs — and Electron only loads an ESM preload with sandbox disabled.
      // Emit CJS instead so the preload runs in the default sandboxed renderer.
      lib: { entry: 'src/preload/index.ts', formats: ['cjs'], fileName: () => 'index.cjs' },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
    },
    plugins: [react()],
  },
});
