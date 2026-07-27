// src/main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicShaderClient } from '../core/generation/claudeClient';
import { generateScene } from '../core/generation/engine';
import { validateShaderInChromium, closeValidatorWindow } from './offscreenValidator';

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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
