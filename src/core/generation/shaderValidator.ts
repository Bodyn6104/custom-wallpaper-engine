// @ts-ignore - gl module doesn't have TypeScript definitions
import createGL from 'gl';

export interface CompileResult {
  success: boolean;
  error?: string;
}

const VERTEX_SHADER = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export function compileFragmentShader(source: string): CompileResult {
  const gl = createGL(1, 1);
  if (!gl) {
    return { success: false, error: 'Failed to create headless WebGL context' };
  }

  let vs: WebGLShader | null = null;
  let fs: WebGLShader | null = null;
  let program: WebGLProgram | null = null;

  try {
    vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);

    fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, source);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fs) || 'Unknown compile error';
      return { success: false, error };
    }

    program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program) || 'Unknown link error';
      return { success: false, error };
    }

    return { success: true };
  } finally {
    // Clean up GL resources on every return path
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    if (program) gl.deleteProgram(program);

    // Destroy the GL context
    gl.getExtension('STACKGL_destroy_context')?.destroy();
  }
}
