// tests/generation/engine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateScene } from '../../src/core/generation/engine';
import { GenerationFailedError } from '../../src/core/generation/types';
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
    const result = await generateScene(client, 'a red field');
    expect(result.shaderCode).toBe(GOOD_SHADER);
    expect(client.requestShader).toHaveBeenCalledTimes(1);
  });

  it('retries with the compile error and succeeds on the second attempt', async () => {
    const requestShader = vi
      .fn()
      .mockResolvedValueOnce(makeResult(BAD_SHADER))
      .mockResolvedValueOnce(makeResult(GOOD_SHADER));
    const client: ClaudeShaderClient = { requestShader };
    const result = await generateScene(client, 'a red field');
    expect(result.shaderCode).toBe(GOOD_SHADER);
    expect(requestShader).toHaveBeenCalledTimes(2);
    const secondCallArgs = requestShader.mock.calls[1];
    expect(secondCallArgs[2]).toBeTruthy();
  });

  it('throws GenerationFailedError after exhausting retries', async () => {
    const client: ClaudeShaderClient = {
      requestShader: vi.fn().mockResolvedValue(makeResult(BAD_SHADER)),
    };
    await expect(generateScene(client, 'a red field')).rejects.toThrow(GenerationFailedError);
    expect(client.requestShader).toHaveBeenCalledTimes(3);
  });
});
