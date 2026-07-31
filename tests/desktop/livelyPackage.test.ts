import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildLivelyPackage, buildLivelyProperties } from '../../src/core/desktop/livelyPackage';
import { compileFragmentShader } from '../../src/core/generation/shaderValidator';
import { GenerationResult } from '../../src/core/generation/types';

/** Reads back the exact GLSL the generated page hands to gl.shaderSource. */
function extractEmbeddedFragmentSource(outDir: string): string {
  const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
  const match = html.match(/<script id="frag" type="x-shader\/x-fragment">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('no <script id="frag"> block found in index.html');
  return match[1];
}

const fixture: GenerationResult = {
  shaderCode: 'void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }',
  params: [
    { name: 'speed', type: 'float', min: 0, max: 3, default: 1, label: 'Speed' },
    { name: 'tint', type: 'color', default: '#C0C0C0', label: 'Tint' },
  ],
  suggestedTitle: 'Test Scene',
  isAnimated: true,
};

let outDir: string;

beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwe-package-'));
});

afterEach(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe('buildLivelyPackage', () => {
  it('writes shader.frag, index.html, LivelyProperties.json, and LivelyInfo.json', () => {
    buildLivelyPackage(fixture, outDir);
    expect(fs.existsSync(path.join(outDir, 'shader.frag'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'LivelyProperties.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'LivelyInfo.json'))).toBe(true);
  });

  it('embeds the shader source in index.html', () => {
    buildLivelyPackage(fixture, outDir);
    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    expect(html).toContain('gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0)');
  });

  it('writes a LivelyInfo.json with the required fields, matching a verified real Lively package', () => {
    buildLivelyPackage(fixture, outDir);
    const info = JSON.parse(fs.readFileSync(path.join(outDir, 'LivelyInfo.json'), 'utf-8'));
    expect(info.Type).toBe(1);
    expect(info.FileName).toBe('index.html');
    expect(info.Title).toBe(fixture.suggestedTitle);
    expect(info.Thumbnail).toBe('thumbnail.jpg');
    expect(info.Preview).toBe('preview.jpg');
  });

  it('writes non-empty thumbnail and preview image files (LivelyInfo.json references must resolve to real files)', () => {
    buildLivelyPackage(fixture, outDir);
    expect(fs.statSync(path.join(outDir, 'thumbnail.jpg')).size).toBeGreaterThan(0);
    expect(fs.statSync(path.join(outDir, 'preview.jpg')).size).toBeGreaterThan(0);
  });
});

// The defect this guards against: generateScene validated result.shaderCode raw
// while the package embedded a param-uniform preamble ahead of it, so the string
// that was validated was never the string that rendered. Every per-task check used
// params: [], where the preamble is empty and the two collapse to the same thing.
describe('the fragment source embedded in index.html', () => {
  const realistic: GenerationResult = {
    shaderCode: `precision mediump float;
uniform float iTime;
uniform vec2 iResolution;
uniform float u_speed;
uniform vec3 u_tint;
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  gl_FragColor = vec4(u_tint * (0.5 + 0.5 * sin(iTime * u_speed + uv.x)), 1.0);
}`,
    params: [
      { name: 'speed', type: 'float', min: 0, max: 3, default: 1, label: 'Speed' },
      { name: 'tint', type: 'color', default: '#C0C0C0', label: 'Tint' },
    ],
    suggestedTitle: 'Realistic Scene',
    isAnimated: true,
  };

  it('compiles, for a shader carrying both a float and a color param', () => {
    buildLivelyPackage(realistic, outDir);
    const result = compileFragmentShader(extractEmbeddedFragmentSource(outDir));
    expect(result.error ?? '').toBe('');
    expect(result.success).toBe(true);
  });

  it('is byte-for-byte the shader the generator produced, so what was validated is what renders', () => {
    buildLivelyPackage(realistic, outDir);
    expect(extractEmbeddedFragmentSource(outDir).trim()).toBe(realistic.shaderCode.trim());
  });
});

// buildLivelyPackage is a pure function reachable independently of the client's
// boundary validation, so it defends its own interpolation seams.
describe('the generated page', () => {
  const base: GenerationResult = {
    shaderCode: 'precision mediump float;\nvoid main(){ gl_FragColor = vec4(1.0); }',
    params: [{ name: 'speed', type: 'float', min: 0, max: 3, default: 1, label: 'Speed' }],
    suggestedTitle: 'T',
    isAnimated: true,
  };

  it('does not let a </script> inside the shader close the block early', () => {
    buildLivelyPackage(
      { ...base, shaderCode: `${base.shaderCode}\n// </script><script>window.PWNED=1;</script>` },
      outDir
    );
    const frag = extractEmbeddedFragmentSource(outDir);
    // Nothing inside the block can terminate it, so the whole shader survives as
    // inert text rather than the tail becoming live markup.
    expect(frag).not.toContain('</script');
    expect(frag).toContain('window.PWNED=1;');
    expect(frag).toContain('gl_FragColor');
  });

  it('does not let a param name break out of the JavaScript string it is written into', () => {
    buildLivelyPackage({ ...base, params: [{ ...base.params[0], name: "x'];alert(1);//" }] }, outDir);
    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    expect(html).not.toContain("uniformLocs['x'];alert(1)");
  });

  it('reports shader compile and link failures instead of rendering a silent black screen', () => {
    buildLivelyPackage(base, outDir);
    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    expect(html).toContain('COMPILE_STATUS');
    expect(html).toContain('LINK_STATUS');
    expect(html).toContain('getShaderInfoLog');
    expect(html).toContain('getProgramInfoLog');
  });
});

describe('buildLivelyProperties', () => {
  it('maps a float param to a slider entry', () => {
    const props = buildLivelyProperties(fixture.params);
    expect(props.speed).toEqual({ type: 'slider', value: 1, min: 0, max: 3, text: 'Speed' });
  });

  it('maps a color param to a color entry with a hex string value (Lively requires "#RRGGBB", not an array)', () => {
    const props = buildLivelyProperties(fixture.params);
    expect(props.tint).toEqual({ type: 'color', value: '#C0C0C0', min: undefined, max: undefined, text: 'Tint' });
  });
});
