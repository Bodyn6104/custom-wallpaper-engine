// scripts/cli-generate.ts
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { AnthropicShaderClient } from '../src/core/generation/claudeClient';
import { generateScene } from '../src/core/generation/engine';

async function main() {
  const prompt = process.argv[2];
  if (!prompt) {
    console.error('Usage: npx tsx scripts/cli-generate.ts "<prompt>"');
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  const client = new AnthropicShaderClient(new Anthropic({ apiKey }));

  console.log(`Generating: "${prompt}"...`);
  const result = await generateScene(client, prompt);

  const outDir = path.join('data', 'cli-output', Date.now().toString());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'shader.frag'), result.shaderCode);
  fs.writeFileSync(path.join(outDir, 'params.json'), JSON.stringify(result.params, null, 2));
  fs.writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify(
      {
        prompt,
        suggestedTitle: result.suggestedTitle,
        isAnimated: result.isAnimated,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`Wrote result to ${outDir}`);
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
