import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildLivelyPackage, buildLivelyProperties } from '../../src/core/desktop/livelyPackage';
import { GenerationResult } from '../../src/core/generation/types';

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
