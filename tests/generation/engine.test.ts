// tests/generation/engine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateScene } from '../../src/core/generation/engine';
import { GenerationFailedError } from '../../src/core/generation/types';
import { compileFragmentShader } from '../../src/core/generation/shaderValidator';
import type { ClaudeShaderClient } from '../../src/core/generation/claudeClient';

const GOOD_SHADER = `void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }`;
const BAD_SHADER = `void main() { gl_FragColor = vec4(1.0 }`;

function makeResult(shaderCode: string) {
  return { shaderCode, params: [], suggestedTitle: 'Test', isAnimated: true };
}

describe('generateScene', () => {
  it('returns the result immediately if the first shader compiles', async () => {
    const client: ClaudeShaderClient = {
      requestShader: vi.fn().mockResolvedValue(makeResult(GOOD_SHADER)),
    };
    const result = await generateScene(client, compileFragmentShader, 'a red field');
    expect(result.shaderCode).toBe(GOOD_SHADER);
    expect(client.requestShader).toHaveBeenCalledTimes(1);
  });

  it('retries with the compile error and succeeds on the second attempt', async () => {
    const requestShader = vi
      .fn()
      .mockResolvedValueOnce(makeResult(BAD_SHADER))
      .mockResolvedValueOnce(makeResult(GOOD_SHADER));
    const client: ClaudeShaderClient = { requestShader };
    const result = await generateScene(client, compileFragmentShader, 'a red field');
    expect(result.shaderCode).toBe(GOOD_SHADER);
    expect(requestShader).toHaveBeenCalledTimes(2);
    const secondCallArgs = requestShader.mock.calls[1];
    expect(secondCallArgs[2]).toBeTruthy();
  });

  // The Electron main process injects a Chromium-backed validator instead of
  // headless-gl, so the engine must use whatever it is given rather than importing
  // a validator itself, and must tolerate an async one.
  it('uses the injected validator and awaits an async result', async () => {
    const client: ClaudeShaderClient = {
      requestShader: vi.fn().mockResolvedValue(makeResult(BAD_SHADER)),
    };
    const validate = vi.fn().mockResolvedValue({ success: true });
    const result = await generateScene(client, validate, 'a red field');
    expect(validate).toHaveBeenCalledWith(BAD_SHADER);
    expect(result.shaderCode).toBe(BAD_SHADER);
    expect(client.requestShader).toHaveBeenCalledTimes(1);
  });

  // lastCompileError is a field on the error object, and ipcMain.handle serialises
  // only `message` across to the renderer — so the diagnostic has to be in the
  // message itself or the user sees "failed after 2 retries" and nothing else.
  it('puts the last compile error in the thrown message, not only on the error object', async () => {
    const client: ClaudeShaderClient = {
      requestShader: vi.fn().mockResolvedValue(makeResult(BAD_SHADER)),
    };
    await expect(generateScene(client, compileFragmentShader, 'a red field')).rejects.toThrow(/ERROR:/);
  });

  it('throws GenerationFailedError after exhausting retries', async () => {
    const client: ClaudeShaderClient = {
      requestShader: vi.fn().mockResolvedValue(makeResult(BAD_SHADER)),
    };
    await expect(generateScene(client, compileFragmentShader, 'a red field')).rejects.toThrow(GenerationFailedError);
    expect(client.requestShader).toHaveBeenCalledTimes(3);
  });
});
