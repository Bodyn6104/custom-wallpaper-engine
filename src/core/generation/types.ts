export type ParamType = 'float' | 'color' | 'bool';

export interface ShaderParam {
  name: string;
  type: ParamType;
  min?: number;
  max?: number;
  /** For 'color' params this is a "#RRGGBB" hex string (Lively's LivelyProperties.json convention) — never an [r,g,b] array. */
  default: number | string | boolean;
  label: string;
}

export interface GenerationResult {
  shaderCode: string;
  params: ShaderParam[];
  suggestedTitle: string;
  isAnimated: boolean;
}

export class GenerationFailedError extends Error {
  constructor(message: string, public lastCompileError?: string) {
    super(message);
    this.name = 'GenerationFailedError';
  }
}
