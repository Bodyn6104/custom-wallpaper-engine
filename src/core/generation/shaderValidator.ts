import createGL from 'gl';
import { CompileResult } from './types';

export type { CompileResult };

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

    // VERTEX_SHADER is a constant that cannot be malformed, so a failure here means
    // a broken GL context or driver, not a fault in the generated shader. Checked
    // and labelled anyway: unchecked, it surfaced later as an opaque link error
    // that read as though the generated fragment shader were to blame.
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(vs) || 'Unknown compile error';
      return {
        success: false,
        error: `Vertex shader failed to compile — this indicates a broken GL context, not a problem with the generated shader: ${error}`,
      };
    }

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
