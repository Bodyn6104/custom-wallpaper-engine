# Custom Wallpaper Engine (CWE) — Core Loop (M0–M3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get from an empty repo to a working Electron app where typing a wallpaper description generates a live GLSL shader, previews it in-app, and applies it as a live wallpaper behind the Windows desktop icons via Lively Wallpaper.

**Architecture:** Three layers — a framework-agnostic `src/core` (Generation Engine + Desktop Integration Layer, usable from plain Node scripts or from Electron's main process), an Electron main/preload/renderer app (`src/main`, `src/preload`, `src/renderer`) built with `electron-vite`, and Lively Wallpaper as an external dependency that owns the actual WorkerW pinning.

**Tech Stack:** TypeScript, Node.js, Vitest (+ `@testing-library/react` for renderer components), `@anthropic-ai/sdk`, `gl` (headless-gl, for real WebGL compile checks in plain Node), Electron + `electron-vite` + React, Lively Wallpaper (external, MIT-licensed).

**Covers:** Milestones M0–M3 from `docs/superpowers/specs/2026-07-21-custom-wallpaper-engine-design.md`. Milestones M4–M6 (tweaking, gallery/revert, multi-monitor polish) are a separate follow-up plan, written after this one is built, so it can incorporate what M0–M3 reveal about real Lively behavior.

## Global Constraints

- **M0 is complete.** Findings are recorded in `docs/superpowers/plans/m0-validation-notes.md`
  and `scripts/lively-cli-config.json` — read the notes file before starting Task 2,
  it corrects several assumptions the rest of this plan was originally written
  with (now already folded into the task text below, but the notes file has the
  full reasoning). In particular: Lively packages must be written directly into
  `%LOCALAPPDATA%\Lively Wallpaper\Library\wallpapers\<id>\` (not an arbitrary
  path), `LivelyInfo.json` is required and has a specific schema, and
  `LivelyProperties.json` color values are `"#RRGGBB"` hex strings, not arrays.
- Windows 11 only (per spec Non-Goals).
- Shaders are GLSL ES 1.00, WebGL1 baseline (per spec Generation Engine contract) — do not target WebGL2-only features.
- Every uniform contract includes `iTime` (float, seconds) and `iResolution` (vec2, pixels) at minimum.
- The only paid/cloud dependency is the Claude API, isolated to `src/core/generation/*`; every function that calls it must accept the API client as a parameter (never construct one internally) so it stays swappable/mockable.
- No .NET SDK dependency — Lively is consumed as a pre-built external app (per spec).
- No local-LLM fallback in this plan (per spec Non-Goals for v1).
- Compile-validate-retry loop caps at 2 retries (3 total attempts) per spec.

---

## Milestone M0 — De-risking Spike

### Task 1: Validate Lively Wallpaper's CLI and Span-mode behavior

This task is manual/exploratory, not code — its entire purpose is to replace assumptions with verified facts before any product code depends on them. Its deliverable is a config file that Task 4's code will load at runtime, so the uncertain specifics (exact CLI flags) live in data, not hardcoded in source.

**Files:**
- Create: `scripts/lively-cli-config.json`
- Create: `docs/superpowers/plans/m0-validation-notes.md`

- [ ] **Step 1: Install Node.js**

Install Node.js LTS (from nodejs.org, or `winget install OpenJS.NodeJS.LTS` in an elevated PowerShell). Verify in a fresh terminal:

```
node --version
npm --version
```
Expected: both print version numbers (Node 20.x or later).

- [ ] **Step 2: Install Lively Wallpaper**

Install Lively Wallpaper (search "Lively Wallpaper" on the Microsoft Store, or download the installer from the project's official GitHub releases page — search for `rocksdanister/lively` on GitHub to find the current official release/install method, since exact distribution channels change over time). Launch it once and confirm the library UI opens.

- [ ] **Step 3: Find Lively's command-line interface**

Open Lively's own documentation/wiki (linked from its GitHub repo) and search for "command line" or "CLI". Locate Lively's install directory (Task Manager → right-click the running Lively process → "Open file location" is a reliable way to find it if docs are unclear). Record the install directory path in `docs/superpowers/plans/m0-validation-notes.md`.

- [ ] **Step 4: Find a working "set wallpaper from a local folder" command**

Using what Step 3 found, construct and run a command that sets a plain static image (any PNG) as your wallpaper, and confirm the desktop background actually changes. Iterate until you have one exact working command line. Record it verbatim in the notes file, e.g.:

```markdown
## Verified: set static wallpaper
Executable: C:\Users\<you>\AppData\Local\Programs\Lively Wallpaper\Lively.exe
Command: Lively.exe setwp --file "C:\path\to\image.png"
Result: desktop background changed successfully
```

- [ ] **Step 5: Confirm a live HTML/WebGL wallpaper renders behind desktop icons**

Create a throwaway folder containing a minimal `index.html` with an animated `<canvas>` (a simple CSS or 2D-canvas animation is enough — this step is only proving the pinning mechanism, not shaders). Apply it via the same command pattern from Step 4 (pointed at the folder instead of an image). Confirm: the animation is visible on your desktop, and your desktop icons render on top of it (not behind).

- [ ] **Step 6: Confirm Span mode across your real 3-monitor layout**

In Lively's settings, set the wallpaper arrangement/layout mode to "Span" (or equivalent — record the exact setting name found). Re-apply the same test page. Confirm: the content spans across all 3 of your monitors (2560×1440 primary at (0,0), 2560×1440 at (-2560,0), 1920×1080 at (2560,0)) positioned correctly per each monitor's actual bounds — not stretched, not duplicated, not misaligned. Record the result (pass/fail + any caveats, e.g. "works but takes ~2s to reflow after applying") in the notes file.

- [ ] **Step 7: Write the final CLI config file and go/no-go decision**

Based on Steps 4–6, write `scripts/lively-cli-config.json`:

```json
{
  "executablePath": "C:\\Users\\<you>\\AppData\\Local\\Programs\\Lively Wallpaper\\Lively.exe",
  "setWallpaperArgs": ["setwp", "--file", "{path}"]
}
```

(Replace `executablePath` and `setWallpaperArgs` with whatever you actually verified in Step 4 — `{path}` is a literal token that Task 4's code substitutes with the real folder path at runtime.)

Append a "Go/No-Go" section to the notes file: if Steps 5–6 both passed, write "GO — proceed to M1" with any caveats found. If Span mode did not work as expected, write exactly what broke — this determines whether Task's later multi-monitor work (M6, a future plan) needs a different approach (e.g., per-monitor duplicate files instead of one spanned canvas). Do not proceed past this task on a "no" for Step 5 (live rendering behind icons) — that is the foundational assumption the whole project depends on.

- [ ] **Step 8: Commit the findings**

```bash
git add scripts/lively-cli-config.json docs/superpowers/plans/m0-validation-notes.md
git commit -m "M0: validate Lively Wallpaper CLI and Span mode, record findings"
```

---

## Milestone M1 — Mechanical Path Proven

### Task 2: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "cwe",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "@types/node": "^22.5.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "resolveJsonModule": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "scripts", "tests"]
}
```

- [ ] **Step 3: Write vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
```

- [ ] **Step 4: Write .gitignore**

```
node_modules/
dist/
out/
data/
*.log
```

- [ ] **Step 5: Install and verify**

```bash
npm install
npx tsc --noEmit
```
Expected: `npm install` completes without errors. `tsc --noEmit` will report `error TS18003: No inputs found` (exit code non-zero) — this is expected and fine at this stage: the `include` globs (`src`, `scripts`, `tests`) don't have any files yet, since those arrive in Task 3 onward. Do not add a placeholder file to work around this; it isn't needed and Task 3 immediately populates `src/core`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "Scaffold TypeScript + Vitest project"
```

### Task 3: Shared types and the Lively package builder

**Files:**
- Create: `src/core/generation/types.ts`
- Create: `src/core/desktop/livelyPackage.ts`
- Test: `tests/desktop/livelyPackage.test.ts`

**Interfaces:**
- Produces: `ShaderParam`, `GenerationResult`, `GenerationFailedError` (from `types.ts`) — consumed by every later task in `src/core`. `buildLivelyPackage(result, outDir)`, `buildLivelyProperties(params)`, and `buildLivelyInfo(result)` (from `livelyPackage.ts`) — consumed by Task 13 (main process apply handler).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/desktop/livelyPackage.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/desktop/livelyPackage.test.ts
```
Expected: FAIL — cannot find module `../../src/core/desktop/livelyPackage` (and `types`).

- [ ] **Step 3: Write types.ts**

```typescript
// src/core/generation/types.ts
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
```

- [ ] **Step 4: Write livelyPackage.ts**

```typescript
// src/core/desktop/livelyPackage.ts
import * as fs from 'fs';
import * as path from 'path';
import { GenerationResult, ShaderParam } from '../generation/types';

// 1x1 red JPEG. LivelyInfo.json's Thumbnail/Preview fields must reference files
// that actually exist — M0 confirmed Lively fails package validation otherwise.
const PLACEHOLDER_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

export function buildLivelyPackage(result: GenerationResult, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'shader.frag'), result.shaderCode, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'index.html'), buildIndexHtml(result), 'utf-8');
  fs.writeFileSync(
    path.join(outDir, 'LivelyProperties.json'),
    JSON.stringify(buildLivelyProperties(result.params), null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(outDir, 'LivelyInfo.json'),
    JSON.stringify(buildLivelyInfo(result), null, 2),
    'utf-8'
  );
  const placeholder = Buffer.from(PLACEHOLDER_JPEG_BASE64, 'base64');
  fs.writeFileSync(path.join(outDir, 'thumbnail.jpg'), placeholder);
  fs.writeFileSync(path.join(outDir, 'preview.jpg'), placeholder);
}

// Schema verified in M0 against a real shipped Lively package
// (rocksdanister/WebGL-Fluid-Simulation, "lively" branch, LivelyInfo.json).
// Type: 1 = web/HTML wallpaper.
export function buildLivelyInfo(result: GenerationResult): Record<string, unknown> {
  return {
    AppVersion: '2.2.1.0',
    Title: result.suggestedTitle,
    Thumbnail: 'thumbnail.jpg',
    Preview: 'preview.jpg',
    Desc: 'Generated by Custom Wallpaper Engine',
    Author: 'CWE',
    License: '',
    Contact: '',
    Type: 1,
    Arguments: '',
    FileName: 'index.html',
  };
}

export function buildLivelyProperties(params: ShaderParam[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const param of params) {
    properties[param.name] = {
      type: param.type === 'float' ? 'slider' : param.type === 'color' ? 'color' : 'checkbox',
      value: param.default,
      min: param.min,
      max: param.max,
      text: param.label,
    };
  }
  return properties;
}

function glslUniformType(type: ShaderParam['type']): string {
  if (type === 'color') return 'vec3';
  if (type === 'bool') return 'bool';
  return 'float';
}

function buildIndexHtml(result: GenerationResult): string {
  const uniformDecls = result.params
    .map((p) => `uniform ${glslUniformType(p.type)} u_${p.name};`)
    .join('\n');

  const defaultValues = Object.fromEntries(result.params.map((p) => [p.name, p.default]));

  const uniformSetters = result.params
    .map((p) => {
      if (p.type === 'color')
        return `  if (uniformLocs['${p.name}']) gl.uniform3fv(uniformLocs['${p.name}'], hexToVec3(values['${p.name}']));`;
      if (p.type === 'bool') return `  if (uniformLocs['${p.name}']) gl.uniform1i(uniformLocs['${p.name}'], values['${p.name}'] ? 1 : 0);`;
      return `  if (uniformLocs['${p.name}']) gl.uniform1f(uniformLocs['${p.name}'], values['${p.name}']);`;
    })
    .join('\n');

  const uniformLookups = result.params
    .map((p) => `uniformLocs['${p.name}'] = gl.getUniformLocation(program, 'u_${p.name}');`)
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>html,body,canvas{margin:0;padding:0;width:100%;height:100%;display:block;overflow:hidden;background:#000;}</style>
</head>
<body>
<canvas id="c"></canvas>
<script id="frag" type="x-shader/x-fragment">
${uniformDecls}
${result.shaderCode}
</script>
<script>
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl');
function resize() {
  canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
  canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// Lively's LivelyProperties.json color values are "#RRGGBB" hex strings, not
// [r,g,b] arrays (verified in M0 against real shipped packages) — convert here.
function hexToVec3(hex) {
  const v = (hex || '#000000').replace('#', '');
  return [
    parseInt(v.substring(0, 2), 16) / 255,
    parseInt(v.substring(2, 4), 16) / 255,
    parseInt(v.substring(4, 6), 16) / 255,
  ];
}

const vsSource = 'attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }';
const fsSource = document.getElementById('frag').textContent;

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

const vs = compile(gl.VERTEX_SHADER, vsSource);
const fs = compile(gl.FRAGMENT_SHADER, fsSource);
const program = gl.createProgram();
gl.attachShader(program, vs);
gl.attachShader(program, fs);
gl.linkProgram(program);
gl.useProgram(program);

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
const positionLoc = gl.getAttribLocation(program, 'position');
gl.enableVertexAttribArray(positionLoc);
gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

const iTimeLoc = gl.getUniformLocation(program, 'iTime');
const iResolutionLoc = gl.getUniformLocation(program, 'iResolution');
const uniformLocs = {};
${uniformLookups}

const values = ${JSON.stringify(defaultValues)};

window.livelyPropertyListener = function(name, value) {
  if (name in values) {
    values[name] = value;
  }
};

function setUniforms() {
${uniformSetters}
}

const start = performance.now();
function frame(now) {
  gl.uniform1f(iTimeLoc, (now - start) / 1000);
  gl.uniform2f(iResolutionLoc, canvas.width, canvas.height);
  setUniforms();
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
</body>
</html>`;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/desktop/livelyPackage.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/generation/types.ts src/core/desktop/livelyPackage.ts tests/desktop/livelyPackage.test.ts
git commit -m "Add shared types and Lively package builder"
```

### Task 4: Lively CLI wrapper

**Files:**
- Create: `src/core/desktop/livelyCli.ts`
- Test: `tests/desktop/livelyCli.test.ts`

**Interfaces:**
- Consumes: `scripts/lively-cli-config.json` (written in Task 1).
- Produces: `LivelyCliConfig`, `loadLivelyCliConfig(configPath: string): LivelyCliConfig`, `buildWallpaperArgs(config, packageFolder): string[]`, `setWallpaper(config, packageFolder): Promise<void>` — consumed by Task 5 (manual apply script) and Task 13 (main process apply handler).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/desktop/livelyCli.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildWallpaperArgs, loadLivelyCliConfig } from '../../src/core/desktop/livelyCli';

describe('loadLivelyCliConfig', () => {
  it('parses a valid config file', () => {
    const tmpFile = path.join(os.tmpdir(), 'lively-cli-config-valid.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      executablePath: 'C:\\Lively\\Lively.exe',
      setWallpaperArgs: ['setwp', '--file', '{path}'],
    }));
    const config = loadLivelyCliConfig(tmpFile);
    expect(config.executablePath).toBe('C:\\Lively\\Lively.exe');
    expect(config.setWallpaperArgs).toEqual(['setwp', '--file', '{path}']);
  });

  it('throws on a config missing required fields', () => {
    const tmpFile = path.join(os.tmpdir(), 'lively-cli-config-invalid.json');
    fs.writeFileSync(tmpFile, JSON.stringify({ executablePath: 'foo.exe' }));
    expect(() => loadLivelyCliConfig(tmpFile)).toThrow('Invalid Lively CLI config');
  });
});

describe('buildWallpaperArgs', () => {
  it('substitutes {path} in each arg', () => {
    const args = buildWallpaperArgs(
      { executablePath: 'Lively.exe', setWallpaperArgs: ['setwp', '--file', '{path}', '--mode', 'span'] },
      'C:\\tmp\\wallpaper-1'
    );
    expect(args).toEqual(['setwp', '--file', 'C:\\tmp\\wallpaper-1', '--mode', 'span']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/desktop/livelyCli.test.ts
```
Expected: FAIL — cannot find module `../../src/core/desktop/livelyCli`.

- [ ] **Step 3: Write livelyCli.ts**

```typescript
// src/core/desktop/livelyCli.ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

export interface LivelyCliConfig {
  executablePath: string;
  setWallpaperArgs: string[];
}

export function loadLivelyCliConfig(configPath: string): LivelyCliConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (typeof parsed.executablePath !== 'string' || !Array.isArray(parsed.setWallpaperArgs)) {
    throw new Error(`Invalid Lively CLI config at ${configPath}`);
  }
  return parsed as LivelyCliConfig;
}

export function buildWallpaperArgs(config: LivelyCliConfig, packageFolder: string): string[] {
  return config.setWallpaperArgs.map((arg) => arg.replace('{path}', packageFolder));
}

export async function setWallpaper(config: LivelyCliConfig, packageFolder: string): Promise<void> {
  const args = buildWallpaperArgs(config, packageFolder);
  await execFileAsync(config.executablePath, args);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/desktop/livelyCli.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/desktop/livelyCli.ts tests/desktop/livelyCli.test.ts
git commit -m "Add Lively CLI wrapper"
```

### Task 5: Manual apply script and mechanical-path verification

**Files:**
- Create: `scripts/apply-hardcoded-shader.ts`
- Create: `scripts/fixtures/test-shader.frag`

**Interfaces:**
- Consumes: `buildLivelyPackage` (Task 3), `loadLivelyCliConfig` + `setWallpaper` (Task 4).

- [ ] **Step 1: Write a hand-written test shader**

```glsl
// scripts/fixtures/test-shader.frag
precision mediump float;
uniform float iTime;
uniform vec2 iResolution;

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec3 color = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0.0, 2.0, 4.0));
  gl_FragColor = vec4(color, 1.0);
}
```

- [ ] **Step 2: Write the apply script**

```typescript
// scripts/apply-hardcoded-shader.ts
import * as fs from 'fs';
import * as path from 'path';
import { buildLivelyPackage } from '../src/core/desktop/livelyPackage';
import { loadLivelyCliConfig, setWallpaper } from '../src/core/desktop/livelyCli';
import type { GenerationResult } from '../src/core/generation/types';

// M0 confirmed: Lively's `setwp --file` only recognizes packages that already
// live inside its own Library folder — an arbitrary external path is silently
// a no-op (no error, nothing in Lively's logs). See docs/superpowers/plans/m0-validation-notes.md.
function livelyLibraryWallpapersDir(): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error('LOCALAPPDATA environment variable is not set');
  }
  return path.join(localAppData, 'Lively Wallpaper', 'Library', 'wallpapers');
}

async function main() {
  const shaderCode = fs.readFileSync(path.join('scripts', 'fixtures', 'test-shader.frag'), 'utf-8');
  const result: GenerationResult = {
    shaderCode,
    params: [],
    suggestedTitle: 'M1 mechanical test',
    isAnimated: true,
  };

  const outDir = path.join(livelyLibraryWallpapersDir(), 'cwe-m1-mechanical-test');
  buildLivelyPackage(result, outDir);
  console.log(`Package written to ${outDir}`);

  const config = loadLivelyCliConfig(path.join('scripts', 'lively-cli-config.json'));
  await setWallpaper(config, outDir);
  console.log('Applied via Lively CLI — check your desktop.');
}

main().catch((err) => {
  console.error('Apply failed:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Run it and manually verify**

```bash
npx tsx scripts/apply-hardcoded-shader.ts
```
Expected: prints "Applied via Lively CLI — check your desktop." Switch to your desktop (minimize/close all windows) and confirm: a smooth animated color-cycling gradient is visible, live, behind your desktop icons on your primary monitor. This proves the full mechanical path: generated shader → Lively package → CLI apply → live on desktop.

- [ ] **Step 4: Commit**

```bash
git add scripts/apply-hardcoded-shader.ts scripts/fixtures/test-shader.frag
git commit -m "M1: prove mechanical path with a hand-written shader"
```

---

## Milestone M2 — Generation Engine

### Task 6: Claude client with structured-output shader generation

**Files:**
- Create: `src/core/generation/claudeClient.ts`
- Test: `tests/generation/claudeClient.test.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk`)

**Interfaces:**
- Consumes: `GenerationResult`, `ShaderParam` (Task 3).
- Produces: `ClaudeShaderClient` interface, `AnthropicShaderClient` class with `requestShader(prompt, priorCode?, compileError?): Promise<GenerationResult>` — consumed by Task 8 (engine.ts) and Task 9 (CLI script).

- [ ] **Step 1: Install the Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/generation/claudeClient.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AnthropicShaderClient } from '../../src/core/generation/claudeClient';

function fakeAnthropicClient(toolInput: unknown) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'tool_use', name: 'emit_wallpaper_shader', input: toolInput }],
      }),
    },
  } as any;
}

describe('AnthropicShaderClient', () => {
  it('parses a tool_use response into a GenerationResult', async () => {
    const fake = fakeAnthropicClient({
      shaderCode: 'void main(){}',
      params: [{ name: 'speed', type: 'float', default: 1, label: 'Speed' }],
      suggestedTitle: 'Nebula',
      isAnimated: true,
    });
    const client = new AnthropicShaderClient(fake);
    const result = await client.requestShader('a nebula');
    expect(result.shaderCode).toBe('void main(){}');
    expect(result.suggestedTitle).toBe('Nebula');
    expect(fake.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ tool_choice: { type: 'tool', name: 'emit_wallpaper_shader' } })
    );
  });

  it('throws if Claude does not return a tool_use block', async () => {
    const fake = {
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'oops' }] }) },
    } as any;
    const client = new AnthropicShaderClient(fake);
    await expect(client.requestShader('a nebula')).rejects.toThrow('did not return a tool_use block');
  });

  it('includes the compile error in the message when retrying', async () => {
    const fake = fakeAnthropicClient({
      shaderCode: 'void main(){}',
      params: [],
      suggestedTitle: 'Fixed',
      isAnimated: true,
    });
    const client = new AnthropicShaderClient(fake);
    await client.requestShader('a nebula', 'void main() { broken }', 'syntax error at broken');
    const callArgs = fake.messages.create.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('syntax error at broken');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/generation/claudeClient.test.ts
```
Expected: FAIL — cannot find module `../../src/core/generation/claudeClient`.

- [ ] **Step 4: Write claudeClient.ts**

```typescript
// src/core/generation/claudeClient.ts
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
      max_tokens: 4096,
      system: buildSystemPrompt(),
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'emit_wallpaper_shader' },
      messages: [{ role: 'user', content: buildUserMessage(prompt, priorCode, compileError) }],
    });

    const toolUse = response.content.find((block: any) => block.type === 'tool_use');
    if (!toolUse) {
      throw new Error('Claude did not return a tool_use block');
    }

    const input = toolUse.input as {
      shaderCode: string;
      params: ShaderParam[];
      suggestedTitle: string;
      isAnimated: boolean;
    };

    return {
      shaderCode: input.shaderCode,
      params: input.params,
      suggestedTitle: input.suggestedTitle,
      isAnimated: input.isAnimated,
    };
  }
}

function buildSystemPrompt(): string {
  return [
    'You write GLSL ES 1.00 fullscreen fragment shaders for desktop wallpapers.',
    'Always use the uniforms uniform float iTime; and uniform vec2 iResolution;.',
    'Always call the emit_wallpaper_shader tool with your result — never respond in plain text.',
    'Define 3-6 tunable params (floats/colors/bools) that meaningfully control the look (speed, contrast, color, fog, etc).',
    'Param names must start with a lowercase letter (this is a hard requirement of the wallpaper engine this feeds into).',
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/generation/claudeClient.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/generation/claudeClient.ts tests/generation/claudeClient.test.ts
git commit -m "Add Claude client with structured-output shader generation"
```

### Task 7: Real WebGL shader compile validation

**Files:**
- Create: `src/core/generation/shaderValidator.ts`
- Test: `tests/generation/shaderValidator.test.ts`
- Modify: `package.json` (add `gl`)

**Interfaces:**
- Produces: `CompileResult`, `compileFragmentShader(source: string): CompileResult` — consumed by Task 8 (engine.ts). Reused unchanged from Electron's main process in Task 13 (headless-gl runs in any Node.js process, including Electron's main process — no Electron-specific code needed here).

- [ ] **Step 1: Install headless-gl and verify it builds**

```bash
npm install gl
```
`gl` compiles a native addon and needs a C++ toolchain. If install fails on Windows with a `node-gyp`/MSBuild error: install "Visual Studio Build Tools" with the "Desktop development with C++" workload (`winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`), then re-run `npm install gl`. Python 3.12 (already installed on this machine) satisfies node-gyp's Python requirement.

Verify the native module loaded:
```bash
node -e "const createGL = require('gl'); console.log(!!createGL(1,1))"
```
Expected: prints `true`.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/generation/shaderValidator.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/generation/shaderValidator.test.ts
```
Expected: FAIL — cannot find module `../../src/core/generation/shaderValidator`.

- [ ] **Step 4: Write shaderValidator.ts**

```typescript
// src/core/generation/shaderValidator.ts
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

  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VERTEX_SHADER);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, source);
  gl.compileShader(fs);

  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(fs) || 'Unknown compile error';
    return { success: false, error };
  }

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program) || 'Unknown link error';
    return { success: false, error };
  }

  return { success: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/generation/shaderValidator.test.ts
```
Expected: PASS (3 tests) — these run the real WebGL compiler, not a mock.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/generation/shaderValidator.ts tests/generation/shaderValidator.test.ts
git commit -m "Add real headless-WebGL shader compile validation"
```

### Task 8: Generation Engine orchestration (compile-validate-retry loop)

**Files:**
- Create: `src/core/generation/engine.ts`
- Test: `tests/generation/engine.test.ts`

**Interfaces:**
- Consumes: `ClaudeShaderClient` (Task 6), `compileFragmentShader` (Task 7), `GenerationFailedError` (Task 3).
- Produces: `generateScene(client: ClaudeShaderClient, prompt: string, priorCode?: string): Promise<GenerationResult>` — consumed by Task 9 (CLI script) and Task 12 (main process IPC handler).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/generation/engine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateScene } from '../../src/core/generation/engine';
import { GenerationFailedError } from '../../src/core/generation/types';
import type { ClaudeShaderClient } from '../../src/core/generation/claudeClient';

const GOOD_SHADER = `void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }`;
const BAD_SHADER = `void main() { gl_FragColor = vec4(1.0 }`;

function makeResult(shaderCode: string) {
  return { shaderCode, params: [], suggestedTitle: 'Test', isAnimated: true };
}

describe('generateScene', () => {
  it('returns the result immediately if the first shader compiles', async () => {
    const client: ClaudeShaderClient = {
      requestShader: vi.fn().mockResolvedValue(makeResult(GOOD_SHADER)),
    };
    const result = await generateScene(client, 'a red field');
    expect(result.shaderCode).toBe(GOOD_SHADER);
    expect(client.requestShader).toHaveBeenCalledTimes(1);
  });

  it('retries with the compile error and succeeds on the second attempt', async () => {
    const requestShader = vi
      .fn()
      .mockResolvedValueOnce(makeResult(BAD_SHADER))
      .mockResolvedValueOnce(makeResult(GOOD_SHADER));
    const client: ClaudeShaderClient = { requestShader };
    const result = await generateScene(client, 'a red field');
    expect(result.shaderCode).toBe(GOOD_SHADER);
    expect(requestShader).toHaveBeenCalledTimes(2);
    const secondCallArgs = requestShader.mock.calls[1];
    expect(secondCallArgs[2]).toBeTruthy();
  });

  it('throws GenerationFailedError after exhausting retries', async () => {
    const client: ClaudeShaderClient = {
      requestShader: vi.fn().mockResolvedValue(makeResult(BAD_SHADER)),
    };
    await expect(generateScene(client, 'a red field')).rejects.toThrow(GenerationFailedError);
    expect(client.requestShader).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/generation/engine.test.ts
```
Expected: FAIL — cannot find module `../../src/core/generation/engine`.

- [ ] **Step 3: Write engine.ts**

```typescript
// src/core/generation/engine.ts
import { ClaudeShaderClient } from './claudeClient';
import { compileFragmentShader } from './shaderValidator';
import { GenerationResult, GenerationFailedError } from './types';

const MAX_RETRIES = 2;

export async function generateScene(
  client: ClaudeShaderClient,
  prompt: string,
  priorCode?: string
): Promise<GenerationResult> {
  let lastError: string | undefined;
  let currentPriorCode = priorCode;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await client.requestShader(prompt, currentPriorCode, lastError);
    const compile = compileFragmentShader(result.shaderCode);

    if (compile.success) {
      return result;
    }

    lastError = compile.error;
    currentPriorCode = result.shaderCode;
  }

  throw new GenerationFailedError(
    `Shader failed to compile after ${MAX_RETRIES} retries`,
    lastError
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/generation/engine.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/generation/engine.ts tests/generation/engine.test.ts
git commit -m "Add generation engine with compile-validate-retry loop"
```

### Task 9: Standalone CLI generation script

**Files:**
- Create: `scripts/cli-generate.ts`

**Interfaces:**
- Consumes: `AnthropicShaderClient` (Task 6), `generateScene` (Task 8).

- [ ] **Step 1: Write the script**

```typescript
// scripts/cli-generate.ts
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { AnthropicShaderClient } from '../src/core/generation/claudeClient';
import { generateScene } from '../src/core/generation/engine';

async function main() {
  const prompt = process.argv[2];
  if (!prompt) {
    console.error('Usage: npx tsx scripts/cli-generate.ts "<prompt>"');
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  const client = new AnthropicShaderClient(new Anthropic({ apiKey }));

  console.log(`Generating: "${prompt}"...`);
  const result = await generateScene(client, prompt);

  const outDir = path.join('data', 'cli-output', Date.now().toString());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'shader.frag'), result.shaderCode);
  fs.writeFileSync(path.join(outDir, 'params.json'), JSON.stringify(result.params, null, 2));
  fs.writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify(
      {
        prompt,
        suggestedTitle: result.suggestedTitle,
        isAnimated: result.isAnimated,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`Wrote result to ${outDir}`);
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Manually verify against the real Claude API**

```bash
set ANTHROPIC_API_KEY=<your key>
npx tsx scripts/cli-generate.ts "slow drifting nebula"
```
Expected: prints "Wrote result to data/cli-output/<timestamp>". Inspect `shader.frag` — it should be a plausible fullscreen fragment shader referencing `iTime`/`iResolution`.

- [ ] **Step 3: Manually verify the generated shader renders live on the desktop**

Copy the generated `shader.frag` over `scripts/fixtures/test-shader.frag` (or point `apply-hardcoded-shader.ts` at the new file), re-run:
```bash
npx tsx scripts/apply-hardcoded-shader.ts
```
Confirm the actual AI-generated nebula scene appears live on your desktop. This closes the loop end-to-end (minus a UI) before any Electron code exists: text prompt → Claude → validated shader → live on desktop.

- [ ] **Step 4: Commit**

```bash
git add scripts/cli-generate.ts
git commit -m "M2: add standalone CLI generation script"
```

---

## Milestone M3 — First Real Usable Version (Electron App)

### Task 10: Electron + Vite + React scaffolding

**Files:**
- Create: `electron.vite.config.ts`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/global.d.ts`
- Modify: `package.json` (add Electron deps + scripts)

- [ ] **Step 1: Install Electron dependencies**

```bash
npm install --save-dev electron electron-vite vite @vitejs/plugin-react
npm install react react-dom
npm install --save-dev @types/react @types/react-dom
```

- [ ] **Step 2: Add dev/build scripts to package.json**

Add to the `"scripts"` object in `package.json`:
```json
"dev": "electron-vite dev",
"build": "electron-vite build"
```

- [ ] **Step 3: Write electron.vite.config.ts**

```typescript
// electron.vite.config.ts
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: { entry: 'src/main/index.ts' },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: { entry: 'src/preload/index.ts' },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
    },
    plugins: [react()],
  },
});
```

- [ ] **Step 4: Write the main process entry (skeleton — IPC handlers added in Tasks 12–13)**

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 5: Write the preload script skeleton**

```typescript
// src/preload/index.ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('cwe', {});
```

- [ ] **Step 6: Write the renderer entry**

```html
<!-- src/renderer/index.html -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Custom Wallpaper Engine</title></head>
<body>
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

```typescript
// src/renderer/src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

```typescript
// src/renderer/src/App.tsx
import React from 'react';

export default function App() {
  return <div>Custom Wallpaper Engine</div>;
}
```

```typescript
// src/renderer/src/global.d.ts
declare global {
  interface Window {
    cwe: Record<string, never>;
  }
}

export {};
```

- [ ] **Step 7: Manually verify the app launches**

```bash
npm run dev
```
Expected: an Electron window opens showing the text "Custom Wallpaper Engine".

- [ ] **Step 8: Commit**

```bash
git add electron.vite.config.ts src/main src/preload src/renderer package.json package-lock.json
git commit -m "Scaffold Electron + Vite + React app shell"
```

### Task 11: Live WebGL preview pane

**Files:**
- Create: `src/renderer/src/components/PreviewPane.tsx`
- Test: `tests/renderer/PreviewPane.test.tsx`
- Create: `tests/setupTests.ts`
- Modify: `vitest.config.ts` (add `setupFiles`)
- Modify: `package.json` (add testing-library deps)

**Interfaces:**
- Consumes: `GenerationResult` (Task 3).
- Produces: `<PreviewPane result={GenerationResult | null} />` — consumed by Task 12 (App.tsx wiring).

- [ ] **Step 1: Install renderer testing dependencies**

```bash
npm install --save-dev jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Add the test setup file and wire it into vitest.config.ts**

```typescript
// tests/setupTests.ts
import '@testing-library/jest-dom/vitest';
```

Update `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setupTests.ts'],
  },
});
```

- [ ] **Step 3: Write the failing test**

```typescript
// tests/renderer/PreviewPane.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PreviewPane from '../../src/renderer/src/components/PreviewPane';

describe('PreviewPane', () => {
  it('shows an empty state when there is no result', () => {
    render(<PreviewPane result={null} />);
    expect(screen.getByText(/describe a wallpaper/i)).toBeInTheDocument();
  });

  it('renders a canvas when a result is provided', () => {
    const { container } = render(
      <PreviewPane
        result={{
          shaderCode: 'void main(){gl_FragColor=vec4(1.0,0.0,0.0,1.0);}',
          params: [],
          suggestedTitle: 'Test',
          isAnimated: true,
        }}
      />
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run tests/renderer/PreviewPane.test.tsx
```
Expected: FAIL — cannot find module `../../src/renderer/src/components/PreviewPane`.

- [ ] **Step 5: Write PreviewPane.tsx**

```typescript
// src/renderer/src/components/PreviewPane.tsx
import React, { useEffect, useRef } from 'react';
import type { GenerationResult } from '../../../core/generation/types';

interface PreviewPaneProps {
  result: GenerationResult | null;
}

export default function PreviewPane({ result }: PreviewPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!result || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const stop = runShader(gl, canvas, result);
    return stop;
  }, [result]);

  if (!result) {
    return <div className="preview-pane preview-pane--empty">Describe a wallpaper to see a preview</div>;
  }

  return <canvas ref={canvasRef} className="preview-pane" width={960} height={540} />;
}

function glslUniformType(type: string): string {
  if (type === 'color') return 'vec3';
  if (type === 'bool') return 'bool';
  return 'float';
}

function runShader(gl: WebGLRenderingContext, canvas: HTMLCanvasElement, result: GenerationResult): () => void {
  const uniformDecls = result.params.map((p) => `uniform ${glslUniformType(p.type)} u_${p.name};`).join('\n');
  const vs = compile(gl, gl.VERTEX_SHADER, 'attribute vec2 p; void main(){gl_Position=vec4(p,0.0,1.0);}');
  const fs = compile(gl, gl.FRAGMENT_SHADER, `${uniformDecls}\n${result.shaderCode}`);

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const positionLoc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  const iTimeLoc = gl.getUniformLocation(program, 'iTime');
  const iResolutionLoc = gl.getUniformLocation(program, 'iResolution');

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
  };
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run tests/renderer/PreviewPane.test.tsx
```
Expected: PASS (2 tests). Note: jsdom has no real WebGL context, so `canvas.getContext('webgl')` returns `null` in the test environment and the effect exits early — these tests verify DOM structure (empty state vs. canvas element), not actual rendering. Actual rendering correctness is verified manually in Task 14's end-to-end check.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/PreviewPane.tsx tests/renderer/PreviewPane.test.tsx tests/setupTests.ts vitest.config.ts package.json package-lock.json
git commit -m "Add live WebGL preview pane"
```

### Task 12: Prompt box and generateScene IPC wiring

**Files:**
- Create: `src/renderer/src/components/PromptBox.tsx`
- Test: `tests/renderer/PromptBox.test.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/global.d.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `PreviewPane` (Task 11), `generateScene` (Task 8), `AnthropicShaderClient` (Task 6).
- Produces: `<PromptBox onSubmit={(prompt: string) => void} isGenerating={boolean} />`; `window.cwe.generateScene(prompt: string): Promise<GenerationResult>` — consumed by Task 13.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/PromptBox.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PromptBox from '../../src/renderer/src/components/PromptBox';

describe('PromptBox', () => {
  it('calls onSubmit with the trimmed prompt text', () => {
    const onSubmit = vi.fn();
    render(<PromptBox onSubmit={onSubmit} isGenerating={false} />);
    fireEvent.change(screen.getByPlaceholderText(/describe a wallpaper/i), {
      target: { value: '  a nebula  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    expect(onSubmit).toHaveBeenCalledWith('a nebula');
  });

  it('disables the button while generating', () => {
    render(<PromptBox onSubmit={vi.fn()} isGenerating={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/renderer/PromptBox.test.tsx
```
Expected: FAIL — cannot find module `../../src/renderer/src/components/PromptBox`.

- [ ] **Step 3: Write PromptBox.tsx**

```typescript
// src/renderer/src/components/PromptBox.tsx
import React, { useState } from 'react';

interface PromptBoxProps {
  onSubmit: (prompt: string) => void;
  isGenerating: boolean;
}

export default function PromptBox({ onSubmit, isGenerating }: PromptBoxProps) {
  const [prompt, setPrompt] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim() && !isGenerating) {
      onSubmit(prompt.trim());
    }
  }

  return (
    <form onSubmit={handleSubmit} className="prompt-box">
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe a wallpaper, e.g. 'slow drifting nebula'"
        disabled={isGenerating}
      />
      <button type="submit" disabled={isGenerating || !prompt.trim()}>
        {isGenerating ? 'Generating…' : 'Generate'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/renderer/PromptBox.test.tsx
```
Expected: PASS (2 tests).

- [ ] **Step 5: Wire generateScene into the main process**

```typescript
// src/main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicShaderClient } from '../core/generation/claudeClient';
import { generateScene } from '../core/generation/engine';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('generate-scene', async (_event, prompt: string) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    const client = new AnthropicShaderClient(new Anthropic({ apiKey }));
    return generateScene(client, prompt);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 6: Expose generateScene from the preload script**

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { GenerationResult } from '../core/generation/types';

contextBridge.exposeInMainWorld('cwe', {
  generateScene: (prompt: string): Promise<GenerationResult> => ipcRenderer.invoke('generate-scene', prompt),
});
```

- [ ] **Step 7: Update the global type declaration**

```typescript
// src/renderer/src/global.d.ts
import type { GenerationResult } from '../../core/generation/types';

declare global {
  interface Window {
    cwe: {
      generateScene: (prompt: string) => Promise<GenerationResult>;
    };
  }
}

export {};
```

- [ ] **Step 8: Wire PromptBox and PreviewPane into App.tsx**

```typescript
// src/renderer/src/App.tsx
import React, { useState } from 'react';
import PromptBox from './components/PromptBox';
import PreviewPane from './components/PreviewPane';
import type { GenerationResult } from '../../core/generation/types';

export default function App() {
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(prompt: string) {
    setIsGenerating(true);
    setError(null);
    try {
      const generated = await window.cwe.generateScene(prompt);
      setResult(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="app">
      <PromptBox onSubmit={handleSubmit} isGenerating={isGenerating} />
      {error && <div className="error">{error}</div>}
      <PreviewPane result={result} />
    </div>
  );
}
```

- [ ] **Step 9: Manually verify**

```bash
set ANTHROPIC_API_KEY=<your key>
npm run dev
```
Type "slow drifting nebula" into the prompt box, click Generate. Expected: after a few seconds, a live animated shader appears in the preview pane inside the app window.

- [ ] **Step 10: Commit**

```bash
git add src/renderer src/main/index.ts src/preload/index.ts tests/renderer/PromptBox.test.tsx
git commit -m "Wire prompt box and generateScene IPC into the app"
```

### Task 13: Apply button, desktop apply wiring, and end-to-end verification

**Files:**
- Create: `src/renderer/src/components/ApplyButton.tsx`
- Test: `tests/renderer/ApplyButton.test.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/global.d.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `buildLivelyPackage` (Task 3), `loadLivelyCliConfig` + `setWallpaper` (Task 4).
- Produces: `window.cwe.applyWallpaper(result: GenerationResult): Promise<{ appliedPath: string }>`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/ApplyButton.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ApplyButton from '../../src/renderer/src/components/ApplyButton';

const fixture = { shaderCode: 'void main(){}', params: [], suggestedTitle: 'T', isAnimated: true };

beforeEach(() => {
  (window as any).cwe = { applyWallpaper: vi.fn().mockResolvedValue({ appliedPath: 'C:\\tmp\\x' }) };
});

describe('ApplyButton', () => {
  it('is disabled when there is no result', () => {
    render(<ApplyButton result={null} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls applyWallpaper and shows Applied on success', async () => {
    render(<ApplyButton result={fixture} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/applied/i)).toBeInTheDocument());
    expect((window as any).cwe.applyWallpaper).toHaveBeenCalledWith(fixture);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/renderer/ApplyButton.test.tsx
```
Expected: FAIL — cannot find module `../../src/renderer/src/components/ApplyButton`.

- [ ] **Step 3: Write ApplyButton.tsx**

```typescript
// src/renderer/src/components/ApplyButton.tsx
import React, { useState } from 'react';
import type { GenerationResult } from '../../../core/generation/types';

interface ApplyButtonProps {
  result: GenerationResult | null;
}

export default function ApplyButton({ result }: ApplyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'applying' | 'applied' | 'error'>('idle');

  async function handleClick() {
    if (!result) return;
    setStatus('applying');
    try {
      await window.cwe.applyWallpaper(result);
      setStatus('applied');
    } catch {
      setStatus('error');
    }
  }

  const label =
    status === 'applying' ? 'Applying…' : status === 'applied' ? 'Applied ✓' : status === 'error' ? 'Failed — retry' : 'Apply to Desktop';

  return (
    <button onClick={handleClick} disabled={!result || status === 'applying'}>
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/renderer/ApplyButton.test.tsx
```
Expected: PASS (2 tests).

- [ ] **Step 5: Add the apply-wallpaper IPC handler to the main process**

```typescript
// src/main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicShaderClient } from '../core/generation/claudeClient';
import { generateScene } from '../core/generation/engine';
import { buildLivelyPackage } from '../core/desktop/livelyPackage';
import { loadLivelyCliConfig, setWallpaper } from '../core/desktop/livelyCli';
import type { GenerationResult } from '../core/generation/types';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('generate-scene', async (_event, prompt: string) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    const client = new AnthropicShaderClient(new Anthropic({ apiKey }));
    return generateScene(client, prompt);
  });

  ipcMain.handle('apply-wallpaper', async (_event, result: GenerationResult) => {
    // M0 confirmed: Lively's `setwp --file` only recognizes packages already inside
    // its own Library folder, not an arbitrary path — see m0-validation-notes.md.
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new Error('LOCALAPPDATA environment variable is not set');
    }
    const outDir = path.join(localAppData, 'Lively Wallpaper', 'Library', 'wallpapers', `cwe-${Date.now()}`);
    buildLivelyPackage(result, outDir);
    const config = loadLivelyCliConfig(path.join(app.getAppPath(), 'scripts', 'lively-cli-config.json'));
    await setWallpaper(config, outDir);
    return { appliedPath: outDir };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 6: Expose applyWallpaper from the preload script**

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { GenerationResult } from '../core/generation/types';

contextBridge.exposeInMainWorld('cwe', {
  generateScene: (prompt: string): Promise<GenerationResult> => ipcRenderer.invoke('generate-scene', prompt),
  applyWallpaper: (result: GenerationResult): Promise<{ appliedPath: string }> =>
    ipcRenderer.invoke('apply-wallpaper', result),
});
```

- [ ] **Step 7: Update the global type declaration**

```typescript
// src/renderer/src/global.d.ts
import type { GenerationResult } from '../../core/generation/types';

declare global {
  interface Window {
    cwe: {
      generateScene: (prompt: string) => Promise<GenerationResult>;
      applyWallpaper: (result: GenerationResult) => Promise<{ appliedPath: string }>;
    };
  }
}

export {};
```

- [ ] **Step 8: Wire ApplyButton into App.tsx**

```typescript
// src/renderer/src/App.tsx
import React, { useState } from 'react';
import PromptBox from './components/PromptBox';
import PreviewPane from './components/PreviewPane';
import ApplyButton from './components/ApplyButton';
import type { GenerationResult } from '../../core/generation/types';

export default function App() {
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(prompt: string) {
    setIsGenerating(true);
    setError(null);
    try {
      const generated = await window.cwe.generateScene(prompt);
      setResult(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="app">
      <PromptBox onSubmit={handleSubmit} isGenerating={isGenerating} />
      {error && <div className="error">{error}</div>}
      <PreviewPane result={result} />
      <ApplyButton result={result} />
    </div>
  );
}
```

- [ ] **Step 9: End-to-end manual verification**

```bash
set ANTHROPIC_API_KEY=<your key>
npm run dev
```
Type "slow drifting nebula", click Generate, confirm the preview renders. Click "Apply to Desktop", wait for it to show "Applied ✓". Minimize the app and check your primary monitor: the same nebula scene should now be visible live, behind your desktop icons. This is the M3 milestone deliverable — the full core loop working end to end.

- [ ] **Step 10: Commit**

```bash
git add src/renderer src/main/index.ts src/preload/index.ts tests/renderer/ApplyButton.test.tsx
git commit -m "M3: wire Apply-to-desktop, complete core loop end to end"
```

---

## Plan Complete

At the end of Task 13, running `npm run dev`, describing a wallpaper, and clicking Apply produces a live shader wallpaper on the primary monitor — the full pipeline from the design spec's M3 milestone. Tweaking (M4), gallery/revert (M5), and multi-monitor Span-mode wiring (M6) are covered in a follow-up plan, written after this one lands so it can build on whatever M0's Span-mode findings and this implementation reveal.
