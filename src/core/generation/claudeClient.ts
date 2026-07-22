import type Anthropic from '@anthropic-ai/sdk';
import { GenerationResult, ShaderParam } from './types';

const TOOL_SCHEMA = {
  name: 'emit_wallpaper_shader',
  description: 'Emit a generated WebGL fullscreen fragment shader and its tunable parameters.',
  input_schema: {
    type: 'object',
    properties: {
      shaderCode: {
        type: 'string',
        description: 'GLSL ES 1.00 fullscreen fragment shader source using iTime and iResolution uniforms.',
      },
      params: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['float', 'color', 'bool'] },
            min: { type: 'number' },
            max: { type: 'number' },
            default: {},
            label: { type: 'string' },
          },
          required: ['name', 'type', 'default', 'label'],
        },
      },
      suggestedTitle: { type: 'string' },
      isAnimated: { type: 'boolean' },
    },
    required: ['shaderCode', 'params', 'suggestedTitle', 'isAnimated'],
  },
} as const;

export interface ClaudeShaderClient {
  requestShader(prompt: string, priorCode?: string, compileError?: string): Promise<GenerationResult>;
}

export class AnthropicShaderClient implements ClaudeShaderClient {
  constructor(private client: Anthropic) {}

  async requestShader(prompt: string, priorCode?: string, compileError?: string): Promise<GenerationResult> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      system: buildSystemPrompt(),
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'emit_wallpaper_shader' },
      messages: [{ role: 'user', content: buildUserMessage(prompt, priorCode, compileError) }],
    });

    const toolUse = response.content.find((block: any) => block.type === 'tool_use');
    if (!toolUse) {
      throw new Error('Claude did not return a tool_use block');
    }

    const input = toolUse.input as {
      shaderCode: string;
      params: ShaderParam[];
      suggestedTitle: string;
      isAnimated: boolean;
    };

    return {
      shaderCode: input.shaderCode,
      params: input.params,
      suggestedTitle: input.suggestedTitle,
      isAnimated: input.isAnimated,
    };
  }
}

function buildSystemPrompt(): string {
  return [
    'You write GLSL ES 1.00 fullscreen fragment shaders for desktop wallpapers.',
    'Always use the uniforms uniform float iTime; and uniform vec2 iResolution;.',
    'Always call the emit_wallpaper_shader tool with your result — never respond in plain text.',
    'Define 3-6 tunable params (floats/colors/bools) that meaningfully control the look (speed, contrast, color, fog, etc).',
    'Param names must start with a lowercase letter (this is a hard requirement of the wallpaper engine this feeds into).',
    'Color param defaults must be "#RRGGBB" hex strings, not arrays.',
    'Keep shaders self-contained: no texture/image inputs, procedural only.',
  ].join(' ');
}

function buildUserMessage(prompt: string, priorCode?: string, compileError?: string): string {
  if (compileError && priorCode) {
    return `The following shader failed to compile:\n\n${priorCode}\n\nCompiler error:\n${compileError}\n\nFix it and re-emit the full corrected shader via emit_wallpaper_shader.`;
  }
  if (priorCode) {
    return `Current shader:\n\n${priorCode}\n\nApply this change and re-emit the full updated shader via emit_wallpaper_shader: "${prompt}"`;
  }
  return `Generate a wallpaper for this description: "${prompt}"`;
}
