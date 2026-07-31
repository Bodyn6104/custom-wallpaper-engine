// Regression cover for commit 936f7fc's try/finally cleanup, plus the vertex shader
// compile check. compileFragmentShader creates a real GL context per call, so a leak
// here accumulates across every retry of every generation. Neither behaviour is
// observable through headless-gl, hence the mocked context — kept in its own file
// because vi.mock('gl') is hoisted and would otherwise disable the real compiles in
// shaderValidator.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const destroySpy = vi.fn();

const gl = {
  VERTEX_SHADER: 35633,
  FRAGMENT_SHADER: 35632,
  COMPILE_STATUS: 35713,
  LINK_STATUS: 35714,
  createShader: vi.fn((_type: number): WebGLShader => ({}) as WebGLShader),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn((_shader: object, _pname: number): boolean => true),
  getShaderInfoLog: vi.fn((_shader: object): string => ''),
  createProgram: vi.fn((): WebGLProgram => ({}) as WebGLProgram),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn((_program: object, _pname: number): boolean => true),
  getProgramInfoLog: vi.fn((_program: object): string => ''),
  deleteShader: vi.fn(),
  deleteProgram: vi.fn(),
  getExtension: vi.fn((_name: string) => ({ destroy: destroySpy })),
};

vi.mock('gl', () => ({ default: () => gl }));

const { compileFragmentShader } = await import('../../src/core/generation/shaderValidator');

/** Shaders in creation order: [0] is the vertex shader, [1] the fragment shader. */
let shaders: object[];

beforeEach(() => {
  vi.clearAllMocks();
  shaders = [];
  // clearAllMocks resets calls but not implementations, so every mock whose
  // behaviour a test can change is restored explicitly here.
  gl.createShader.mockImplementation(() => {
    const shader = {};
    shaders.push(shader);
    return shader as WebGLShader;
  });
  gl.getShaderParameter.mockImplementation(() => true);
  gl.getShaderInfoLog.mockImplementation(() => '');
  gl.getProgramParameter.mockImplementation(() => true);
  gl.getProgramInfoLog.mockImplementation(() => '');
  gl.getExtension.mockImplementation(() => ({ destroy: destroySpy }));
});

/** Makes exactly one of the two shaders fail to compile. */
function failShaderAt(index: 0 | 1, log: string) {
  gl.getShaderParameter.mockImplementation((shader: object) => shader !== shaders[index]);
  gl.getShaderInfoLog.mockImplementation((shader: object) => (shader === shaders[index] ? log : ''));
}

describe('compileFragmentShader vertex shader handling', () => {
  it('reports a vertex shader compile failure as such, not as a confusing link error', () => {
    failShaderAt(0, 'ERROR: vertex boom');

    const result = compileFragmentShader('void main(){}');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Vertex shader');
    expect(result.error).toContain('vertex boom');
  });
});

describe('compileFragmentShader resource cleanup', () => {
  it('deletes both shaders and the program and destroys the context on success', () => {
    expect(compileFragmentShader('void main(){}').success).toBe(true);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('still cleans up when the fragment shader fails to compile', () => {
    failShaderAt(1, 'ERROR: 0:1: boom');

    expect(compileFragmentShader('void main(){').success).toBe(false);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  // The vertex shader returns before the fragment shader is ever created, so only
  // the one allocated resource should be released.
  it('cleans up the one shader that exists when the vertex shader fails', () => {
    failShaderAt(0, 'ERROR: vertex boom');

    expect(compileFragmentShader('void main(){}').success).toBe(false);
    expect(gl.deleteShader).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).not.toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('still cleans up when the program fails to link', () => {
    gl.getProgramParameter.mockImplementation(() => false);
    gl.getProgramInfoLog.mockImplementation(() => 'ERROR: link failed');

    expect(compileFragmentShader('void main(){}').success).toBe(false);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
