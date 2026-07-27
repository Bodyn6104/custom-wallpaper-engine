// src/main/offscreenValidator.ts
import { BrowserWindow } from 'electron';
import type { CompileResult } from '../core/generation/types';

/**
 * Compiles shaders in a hidden Chromium window instead of headless-gl.
 *
 * The Node/CLI path validates with the native `gl` addon, but that binary is built
 * for Node's ABI and cannot be loaded by Electron. Chromium's own WebGL is also the
 * closer check: it is the same GL implementation that will actually run the
 * wallpaper once Lively renders the generated page.
 *
 * Mirrors shaderValidator.ts deliberately — same vertex shader, same compile-then-
 * link order, same error strings — so a shader accepted by one path is accepted by
 * the other and the retry loop behaves identically in both runtimes.
 */

let validatorWindow: BrowserWindow | null = null;

async function getValidatorWindow(): Promise<BrowserWindow> {
  if (validatorWindow && !validatorWindow.isDestroyed()) {
    return validatorWindow;
  }
  const win = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL('about:blank');
  validatorWindow = win;
  return win;
}

export async function validateShaderInChromium(source: string): Promise<CompileResult> {
  const win = await getValidatorWindow();

  // JSON.stringify escapes the shader source into a JS string literal, so shader
  // text cannot break out of the expression.
  const script = `(function (src) {
    var gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return JSON.stringify({ success: false, error: 'Failed to create WebGL context' });

    var vs = null, fs = null, program = null;
    try {
      vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, 'attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }');
      gl.compileShader(vs);

      fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, src);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        return JSON.stringify({ success: false, error: gl.getShaderInfoLog(fs) || 'Unknown compile error' });
      }

      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        return JSON.stringify({ success: false, error: gl.getProgramInfoLog(program) || 'Unknown link error' });
      }

      return JSON.stringify({ success: true });
    } finally {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      if (program) gl.deleteProgram(program);
    }
  })(${JSON.stringify(source)})`;

  return JSON.parse(await win.webContents.executeJavaScript(script)) as CompileResult;
}

export function closeValidatorWindow(): void {
  if (validatorWindow && !validatorWindow.isDestroyed()) {
    validatorWindow.destroy();
  }
  validatorWindow = null;
}
