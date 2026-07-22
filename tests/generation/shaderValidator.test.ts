import { describe, it, expect } from 'vitest';
import { compileFragmentShader } from '../../src/core/generation/shaderValidator';

describe('compileFragmentShader', () => {
  it('succeeds for a valid fragment shader', () => {
    const result = compileFragmentShader(`
      precision mediump float;
      uniform float iTime;
      uniform vec2 iResolution;
      void main() {
        gl_FragColor = vec4(sin(iTime), 0.0, 0.0, 1.0);
      }
    `);
    expect(result.success).toBe(true);
  });

  it('fails for a shader with a syntax error', () => {
    const result = compileFragmentShader(`
      void main() {
        gl_FragColor = vec4(1.0
      }
    `);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('fails for a shader referencing an undeclared variable', () => {
    const result = compileFragmentShader(`
      void main() {
        gl_FragColor = vec4(undeclaredVar, 0.0, 0.0, 1.0);
      }
    `);
    expect(result.success).toBe(false);
  });
});
