// src/core/generation/engine.ts
import { ClaudeShaderClient } from './claudeClient';
import { compileFragmentShader } from './shaderValidator';
import { GenerationResult, GenerationFailedError } from './types';

const MAX_RETRIES = 2;

export async function generateScene(
  client: ClaudeShaderClient,
  prompt: string,
  priorCode?: string
): Promise<GenerationResult> {
  let lastError: string | undefined;
  let currentPriorCode = priorCode;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await client.requestShader(prompt, currentPriorCode, lastError);
    const compile = compileFragmentShader(result.shaderCode);

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
