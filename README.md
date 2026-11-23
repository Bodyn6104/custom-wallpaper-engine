# Custom Wallpaper Engine

Type a description of a wallpaper. Get a live, GPU-rendered one on your Windows desktop, behind the icons.

```
"neon rain over a cyberpunk skyline"  →  Claude writes a GLSL shader
                                       →  the shader is compiled and checked before you ever see it
                                       →  live preview in the app
                                       →  one click applies it to the desktop through Lively Wallpaper
```

Windows 11 · Electron + React + TypeScript · WebGL 1 / GLSL ES 1.00 · Claude API via `@anthropic-ai/sdk` · Vitest

## Why shaders, not images

Every wallpaper is a fullscreen fragment shader, rendered in real time. That means it is sharp at any
resolution and any DPI, it animates for free, and a tunable parameter (speed, fog, tint) is just a
uniform. No diffusion model, no baked PNGs, nothing to re-generate when a monitor changes.

The one paid, cloud dependency is the Claude API call that writes the shader. Everything else runs locally.

## How it works

The code is three layers. The first two are plain TypeScript with no UI dependency, so they run from a
Node script as well as from the Electron app.

### 1. Generation engine — `src/core/generation`

- **Structured output, not prose parsing.** The request forces a single tool call,
  `emit_wallpaper_shader`, whose schema is the contract: `shaderCode`, a `params` array
  (`float` / `color` / `bool` with min, max, default, label), `suggestedTitle`, `isAnimated`.
  The tool input is the only place model output enters the system, and `parseToolInput` validates
  every field there before anything touches the filesystem or generated code.
- **Compile-validate-retry.** Before a shader reaches the UI or disk it is compiled in a real WebGL
  context. On failure the compiler error is sent back to the model verbatim with the broken source,
  and it re-emits the whole shader. Up to 2 retries (3 attempts); only then does the user see a failure.
  This is the reliability mechanism for the riskiest part of the system: LLM-written GLSL that does
  not compile.
- **Two validators, same behavior.** The Node/CLI path compiles with `headless-gl`. The Electron path
  cannot load that native addon, so it compiles in a hidden Chromium window instead, which is also the
  closer check: it is the same GL implementation Lively's WebView2 renderer will use on the desktop.
  Both use the same vertex shader, compile-then-link order, and error strings, so a shader accepted by
  one is accepted by the other.
- **Prompt contract.** The system prompt pins GLSL ES 1.00, the `iTime` / `iResolution` uniforms,
  3–6 tunable params, lowercase-first param names (a Lively requirement), `#RRGGBB` color defaults,
  and that the model declares its own `u_<param>` uniforms after its precision statement. Each of
  those lines exists because its absence produced a real failure during development.

### 2. Desktop integration — `src/core/desktop`

- Builds the folder format Lively Wallpaper expects: `index.html` (a self-contained WebGL page that
  runs the shader), `shader.frag`, `LivelyProperties.json`, `LivelyInfo.json`, and placeholder
  thumbnails.
- The param schema maps straight onto `LivelyProperties.json`, so Lively's own settings panel gives
  you sliders, color pickers, and checkboxes for every generated parameter with no extra UI work.
- Applies the package with `Lively.exe setwp --file <folder>`. The CLI flags live in
  `scripts/lively-cli-config.json`, not in source, because they were discovered empirically.

Lively owns the undocumented Windows `WorkerW` trick that puts a window behind the desktop icons.
This project owns the novel part, text to scene code, and leaves the Windows internals to a
maintained, MIT-licensed tool.

### 3. The app — `src/main`, `src/preload`, `src/renderer`

Prompt box → live preview → Apply button. The preview pane runs the exact fragment source that gets
packaged, so what you see is what lands on the desktop. The renderer is sandboxed with context
isolation; the main process exposes two IPC calls, `generate-scene` and `apply-wallpaper`.

### Hardening that is easy to miss

- Param names are checked against `^[a-z][A-Za-z0-9_]*$` at the boundary because they are
  interpolated into the generated page's JavaScript and into Lively's property file.
- Names are written into generated JS with `JSON.stringify`, never string templates.
- `</script` inside shader text is neutralised before the shader is inlined into `index.html`.
- A response that stops at `max_tokens` is rejected rather than parsed as a partial object.
- Every GL object created during validation is deleted on every exit path. A leak here was caught
  in review and has its own regression test.

## Status

Milestones M0–M3 of the [design spec](docs/superpowers/specs/2026-07-21-custom-wallpaper-engine-design.md)
are built: the full loop from prompt to applied desktop wallpaper. The Lively path was verified by
hand on a real 3-monitor, mixed-resolution setup during M0.

Not built yet (M4–M6 in the spec): in-app parameter sliders and natural-language tweaks
("make it slower"), a gallery with history and revert, still-image output, multi-monitor polish, and
a packaged installer. The app runs from source.

## Getting started

Requirements:

- Windows 11
- Node.js 20 or newer
- [Lively Wallpaper](https://github.com/rocksdanister/lively) 2.2.x, installed to
  `C:\Program Files\Lively Wallpaper\Lively.exe` (`winget install rocksdanister.LivelyWallpaper`).
  If it lives elsewhere, edit `scripts/lively-cli-config.json`.
- An Anthropic API key

```powershell
git clone https://github.com/Bodyn6104/custom-wallpaper-engine.git
cd custom-wallpaper-engine
npm install
```

Create a `.env` file in the project root (it is git-ignored):

```
ANTHROPIC_API_KEY=your-key-here
```

Then:

```powershell
npm run dev        # launches the Electron app
npm test           # runs the Vitest suite
```

Type a description, wait for the preview, click **Apply to Desktop**. Open Lively's settings for
the active wallpaper to adjust the generated parameters.

Without the app:

```powershell
# Generate a shader from the terminal; output lands in data/cli-output/<timestamp>/
npx tsx scripts/cli-generate.ts "slow drifting nebula"

# Apply a hand-written shader with no API call, to prove the Lively path on a new machine
npx tsx scripts/apply-hardcoded-shader.ts
```

## Project layout

```
src/core/generation/   Claude client, structured-output parsing, shader validator, retry loop
src/core/desktop/      Lively package builder and CLI wrapper
src/main/              Electron main process: IPC handlers, hidden-window validator, .env loader
src/preload/           Sandboxed bridge exposing generateScene / applyWallpaper to the renderer
src/renderer/          React UI: PromptBox, PreviewPane, ApplyButton
scripts/               CLI generation, mechanical apply test, Lively CLI config
tests/                 Vitest suite mirroring src/ (59 tests)
docs/superpowers/      Design spec, M0 validation notes, M0–M3 implementation plan
```

## How it was built

Spec first, then a de-risking spike, then test-driven implementation, with Claude Code doing the
typing and the author directing, reviewing, and testing on real hardware.

1. **Design spec** (`docs/superpowers/specs/`): goals, non-goals, architecture, and a decision log
   with the reasoning for each choice (why Lively, why shaders, why Electron).
2. **M0 spike** (`docs/superpowers/plans/m0-validation-notes.md`): no product code, just verifying
   the riskiest assumptions by hand. It overturned three of them: Lively's `setwp` silently ignores
   any folder outside its own Library, `LivelyInfo.json` is required and has a specific schema, and
   color values are hex strings, not arrays. The plan was corrected before the first line of code.
3. **Implementation plan** (`docs/superpowers/plans/2026-07-21-cwe-core-loop.md`): 13 tasks across
   M0–M3, each with failing tests written first.

The retry loop, structured-output parsing, package generation, and env loading are unit-tested with
mocked boundaries. Shader quality and actual desktop rendering are hardware-dependent and are
covered by manual smoke tests at each milestone, which the docs say outright rather than claiming
coverage that does not exist.
