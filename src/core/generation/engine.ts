// src/core/generation/engine.ts
import { ClaudeShaderClient } from './claudeClient';
import { GenerationResult, GenerationFailedError, ShaderValidator } from './types';

const MAX_RETRIES = 2;

export async function generateScene(
  client: ClaudeShaderClient,
  validateShader: ShaderValidator,
  prompt: string,
  priorCode?: string
): Promise<GenerationResult> {
  let lastError: string | undefined;
  let currentPriorCode = priorCode;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await client.requestShader(prompt, currentPriorCode, lastError);
    const compile = await validateShader(result.shaderCode);

    if (compile.success) {
      return result;
    }

    lastError = compile.error;
    currentPriorCode = result.shaderCode;
  }

  throw new GenerationFailedError(
    `Shader failed to compile after ${MAX_RETRIES} retries`,
    lastError
  );
}
