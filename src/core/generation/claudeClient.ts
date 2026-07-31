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
      // An elaborate shader plus 3-6 params runs well past 4096 output tokens, and a
      // truncated tool_use block yields a partial `input` object whose missing fields
      // used to sail through as `undefined`. Headroom here, stop_reason checked below.
      max_tokens: 16000,
      system: buildSystemPrompt(),
      // TOOL_SCHEMA is declared `as const` for literal precision elsewhere; the SDK's
      // Tool type expects mutable arrays (e.g. `required: string[]`), so a direct
      // structural cast is rejected. `as unknown as Tool` bridges that one known-safe
      // mismatch while still checking the rest of the shape against the real SDK type.
      tools: [TOOL_SCHEMA as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: 'tool', name: 'emit_wallpaper_shader' },
      messages: [{ role: 'user', content: buildUserMessage(prompt, priorCode, compileError) }],
    });

    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        'Claude response was truncated at max_tokens before the shader was complete — increase max_tokens'
      );
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
    );
    if (!toolUse) {
      throw new Error('Claude did not return a tool_use block');
    }

    return parseToolInput(toolUse.input);
  }
}

/**
 * Lively requires a lowercase-first identifier, and the name is interpolated into
 * the generated wallpaper page's JavaScript — so anything outside this shape is
 * rejected at the boundary rather than escaped downstream and hoped for.
 */
const PARAM_NAME_PATTERN = /^[a-z][A-Za-z0-9_]*$/;

/**
 * The SDK types tool_use `input` as `unknown` precisely because the model can
 * return anything. This is the only place external data enters the system, and it
 * flows on into filesystem writes and generated code, so it is checked here rather
 * than blind-cast: a missing `params` used to surface as a crash in params.map,
 * in the main process, with no useful message.
 */
export function parseToolInput(input: unknown): GenerationResult {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Claude tool response was not an object');
  }
  const raw = input as Record<string, unknown>;

  if (typeof raw.shaderCode !== 'string' || raw.shaderCode.trim() === '') {
    throw new Error('Claude tool response has no valid shaderCode string');
  }
  if (!Array.isArray(raw.params)) {
    throw new Error('Claude tool response has no valid params array');
  }
  if (typeof raw.suggestedTitle !== 'string' || raw.suggestedTitle.trim() === '') {
    throw new Error('Claude tool response has no valid suggestedTitle string');
  }
  if (typeof raw.isAnimated !== 'boolean') {
    throw new Error('Claude tool response has no valid isAnimated boolean');
  }

  return {
    shaderCode: raw.shaderCode,
    params: raw.params.map(parseParam),
    suggestedTitle: raw.suggestedTitle,
    isAnimated: raw.isAnimated,
  };
}

function parseParam(param: unknown): ShaderParam {
  if (typeof param !== 'object' || param === null) {
    throw new Error('Claude tool response contains a param that is not an object');
  }
  const raw = param as Record<string, unknown>;

  if (typeof raw.name !== 'string' || !PARAM_NAME_PATTERN.test(raw.name)) {
    throw new Error(
      `Claude tool response contains an invalid param name ${JSON.stringify(raw.name)} — must match ${PARAM_NAME_PATTERN}`
    );
  }
  if (raw.type !== 'float' && raw.type !== 'color' && raw.type !== 'bool') {
    throw new Error(`Param "${raw.name}" has an invalid type ${JSON.stringify(raw.type)}`);
  }
  if (typeof raw.label !== 'string' || raw.label.trim() === '') {
    throw new Error(`Param "${raw.name}" has no valid label`);
  }
  const isValidDefault =
    raw.type === 'color'
      ? typeof raw.default === 'string'
      : raw.type === 'bool'
        ? typeof raw.default === 'boolean'
        : typeof raw.default === 'number';
  if (!isValidDefault) {
    throw new Error(`Param "${raw.name}" (${raw.type}) has an invalid default ${JSON.stringify(raw.default)}`);
  }

  return {
    name: raw.name,
    type: raw.type,
    label: raw.label,
    default: raw.default as number | string | boolean,
    ...(typeof raw.min === 'number' ? { min: raw.min } : {}),
    ...(typeof raw.max === 'number' ? { max: raw.max } : {}),
  };
}

function buildSystemPrompt(): string {
  return [
    'You write GLSL ES 1.00 fullscreen fragment shaders for desktop wallpapers.',
    'Always use the uniforms uniform float iTime; and uniform vec2 iResolution;.',
    'Always call the emit_wallpaper_shader tool with your result — never respond in plain text.',
    'Define 3-6 tunable params (floats/colors/bools) that meaningfully control the look (speed, contrast, color, fog, etc).',
    'Param names must start with a lowercase letter and contain only letters, digits, and underscores (a hard requirement of the wallpaper engine this feeds into).',
    'You must declare every param yourself as a uniform named u_<paramName>, after your precision statement — a param named "speed" means you declare uniform float u_speed;. Nothing is prepended to your shader, so any uniform you reference and do not declare will fail to compile.',
    'Map param types to uniform types: float -> float, color -> vec3, bool -> bool.',
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
