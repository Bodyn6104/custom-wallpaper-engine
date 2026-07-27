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

export interface CompileResult {
  success: boolean;
  error?: string;
}

/**
 * Compiles a fragment shader and reports whether it is valid.
 *
 * Injected into generateScene rather than imported, because the two runtimes
 * validate differently: the Node/CLI path uses headless-gl, while Electron uses
 * a hidden Chromium window (headless-gl is a native addon built for Node's ABI
 * and cannot load in Electron). Declared here, not in shaderValidator.ts, so
 * that importing this type never pulls in the native `gl` binding.
 */
export type ShaderValidator = (source: string) => CompileResult | Promise<CompileResult>;

export class GenerationFailedError extends Error {
  constructor(message: string, public lastCompileError?: string) {
    super(message);
    this.name = 'GenerationFailedError';
  }
}
