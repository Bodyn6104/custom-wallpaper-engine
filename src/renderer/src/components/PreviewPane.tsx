// src/renderer/src/components/PreviewPane.tsx
import { useEffect, useRef } from 'react';
import type { GenerationResult, ShaderParam } from '../../../core/generation/types';

interface PreviewPaneProps {
  result: GenerationResult | null;
}

export default function PreviewPane({ result }: PreviewPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!result || !canvasRef.current) return;
    const canvas = canvasRef.current;
    // jsdom has no WebGL context, so this is null under test and the effect exits early.
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    return runShader(gl, canvas, result);
  }, [result]);

  if (!result) {
    return <div className="preview-pane preview-pane--empty">Describe a wallpaper to see a preview</div>;
  }

  return <canvas ref={canvasRef} className="preview-pane" width={960} height={540} />;
}

/**
 * The exact fragment source that gets compiled — here, in the Lively package
 * (livelyPackage.ts buildIndexHtml), and by the validator in generateScene.
 *
 * This is deliberately the identity function. It used to prepend a `uniform
 * <type> u_<name>;` line per param, which put those declarations above the
 * shader's own `precision mediump float;` — a hard GLSL ES 1.00 error — and
 * redeclared uniforms the model had already written, while generateScene
 * validated the raw shader and never saw either problem. The model now declares
 * its own u_<param> uniforms (see buildSystemPrompt in claudeClient.ts).
 *
 * Kept as a named seam so that anything reintroducing composition has one place
 * to do it, and one test (PreviewPane.test.tsx) forcing validation to follow.
 */
export function buildFragmentSource(result: GenerationResult): string {
  return result.shaderCode;
}

/** Lively stores color params as "#RRGGBB" hex strings, not [r,g,b] arrays — convert here. */
export function paramUniformValue(param: ShaderParam): number | [number, number, number] {
  if (param.type === 'color') {
    const hex = String(param.default ?? '#000000').replace('#', '');
    return [
      parseInt(hex.substring(0, 2), 16) / 255,
      parseInt(hex.substring(2, 4), 16) / 255,
      parseInt(hex.substring(4, 6), 16) / 255,
    ];
  }
  if (param.type === 'bool') return param.default ? 1 : 0;
  return Number(param.default);
}

function runShader(
  gl: WebGLRenderingContext,
  canvas: HTMLCanvasElement,
  result: GenerationResult
): () => void {
  const vs = compile(gl, gl.VERTEX_SHADER, 'attribute vec2 p; void main(){gl_Position=vec4(p,0.0,1.0);}');
  const fs = compile(gl, gl.FRAGMENT_SHADER, buildFragmentSource(result));

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    // The engine already compile-validates before returning, so reaching here means
    // the preview's preamble diverged from the validator's — surface it, don't go black.
    console.error('Preview shader link failed:', gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const positionLoc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  // Params have no in-app UI yet (Lively drives them on the desktop), but they must be
  // seeded to their defaults or the preview renders every param at 0.
  for (const param of result.params) {
    const loc = gl.getUniformLocation(program, `u_${param.name}`);
    if (!loc) continue;
    const value = paramUniformValue(param);
    if (Array.isArray(value)) gl.uniform3fv(loc, value);
    else if (param.type === 'bool') gl.uniform1i(loc, value);
    else gl.uniform1f(loc, value);
  }

  const iTimeLoc = gl.getUniformLocation(program, 'iTime');
  const iResolutionLoc = gl.getUniformLocation(program, 'iResolution');

  gl.viewport(0, 0, canvas.width, canvas.height);

  const start = performance.now();
  let stopped = false;
  let frameId = 0;

  function frame(now: number) {
    if (stopped) return;
    gl.uniform1f(iTimeLoc, (now - start) / 1000);
    gl.uniform2f(iResolutionLoc, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(frameId);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  };
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Preview shader compile failed:', gl.getShaderInfoLog(shader));
  }
  return shader;
}
