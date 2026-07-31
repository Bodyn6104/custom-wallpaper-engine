// src/main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicShaderClient } from '../core/generation/claudeClient';
import { generateScene } from '../core/generation/engine';
import { validateShaderInChromium, closeValidatorWindow } from './offscreenValidator';
import { buildLivelyPackage } from '../core/desktop/livelyPackage';
import { loadLivelyCliConfig, setWallpaper } from '../core/desktop/livelyCli';
import { loadEnvFile } from './loadEnv';
import type { GenerationResult } from '../core/generation/types';

// Before anything reads process.env.ANTHROPIC_API_KEY. A key exported in the shell
// still wins — loadEnvFile does not overwrite variables that are already set.
loadEnvFile(path.join(app.getAppPath(), '.env'));

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      // .cjs, not .js: package.json sets "type": "module", and an ESM preload
      // would require disabling the renderer sandbox.
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // The validator's hidden window is a BrowserWindow too, so leaving it open would
  // stop 'window-all-closed' from ever firing and the app would never quit.
  mainWindow.on('closed', () => {
    closeValidatorWindow();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('generate-scene', async (_event, prompt: string) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    const client = new AnthropicShaderClient(new Anthropic({ apiKey }));
    return generateScene(client, validateShaderInChromium, prompt);
  });

  ipcMain.handle('apply-wallpaper', async (_event, result: GenerationResult) => {
    // M0 confirmed: Lively's `setwp --file` only recognizes packages already inside
    // its own Library folder, not an arbitrary path — see m0-validation-notes.md.
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new Error('LOCALAPPDATA environment variable is not set');
    }
    const outDir = path.join(
      localAppData,
      'Lively Wallpaper',
      'Library',
      'wallpapers',
      `cwe-${Date.now()}`
    );
    buildLivelyPackage(result, outDir);
    // Correct while running unpackaged: getAppPath() is the project root and
    // scripts/ sits beside it. Once this is packaged, scripts/ will not be inside
    // the asar unless it is declared as an extraResource — this path must be
    // revisited then (there is no electron-builder config in the repo yet).
    const config = loadLivelyCliConfig(
      path.join(app.getAppPath(), 'scripts', 'lively-cli-config.json')
    );
    await setWallpaper(config, outDir);
    return { appliedPath: outDir };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
