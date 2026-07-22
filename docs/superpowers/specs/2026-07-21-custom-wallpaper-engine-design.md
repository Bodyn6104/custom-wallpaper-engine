# Custom Wallpaper Engine (CWE) — Design

**Date:** 2026-07-21
**Status:** Approved for planning

## Overview

CWE is a local Windows 11 desktop app that turns a plain-language description
("neon rain over a cyberpunk skyline", "slow drifting nebula", "minimal
aurora over mountains") into a live, code-rendered wallpaper — animated or
static — and applies it directly to the desktop, pinned behind the icons.
Everything runs locally except one clearly-flagged paid dependency: the
Claude API call that generates scene code.

## Goals

- Generate wallpapers as real-time WebGL/GLSL, not baked/AI-generated
  images, so output stays sharp at any resolution.
- Render crisp and DPI-aware across the user's actual multi-monitor layout
  (verified against a 3-monitor mixed-resolution setup: 2560×1440,
  2560×1440, 1920×1080).
- Support both animated wallpapers and high-res stills from the same
  pipeline.
- One-click apply directly to the Windows desktop, with revert.
- Support iterative tweaking of a result via natural language ("make it
  slower", "add fog") without needing a full regeneration for simple
  parameter changes.
- Stay local-first: the only paid/cloud dependency is the Claude API call
  used for code generation, and it is clearly isolated to one component.

## Non-Goals (v1)

- No support for other OSes (Windows 11 only).
- No local-LLM fallback for generation in v1 (Generation Engine is designed
  with a narrow interface so this could be added later, but it is not
  built now).
- No diffusion-model image generation — stills are rendered frames from the
  same shader pipeline as animated wallpapers, not a separate image model.
- No independent per-monitor prompts in v1 — one generated scene is spanned
  across all monitors. Per-monitor-different-scenes is a possible future
  extension, not part of this spec.
- No sharing/publishing/community features — this is a personal local tool.

## Architecture

Three independently-testable components:

```
[Prompt/Tweak UI] → [Generation Engine] → shader.frag + params.json
                                              ↓
                          [Preview Pane] ← (same shader, WebGL canvas)
                                              ↓ (on Apply)
                   [Desktop Integration Layer] → Lively package → Lively CLI → Windows desktop
```

### 1. Generation Engine (TypeScript module, no UI dependency)

Takes a text prompt (and, for tweaks, the prior shader code + param schema)
and calls the Claude API to produce a validated GLSL fragment shader plus a
JSON schema of tunable uniforms. Usable standalone via a CLI/test harness,
independent of the Electron app.

**Contract enforced on every generation:**
- Fullscreen fragment shader, GLSL ES 1.00 (WebGL1 baseline, for maximum
  compatibility with the renderer Lively embeds).
- Standard uniforms: `iTime`, `iResolution`.
- Structured output (via Claude tool use) returns `{ shaderCode, params:
  [{name, type, min, max, default, label}], suggestedTitle, isAnimated }` —
  never parsed out of free-form prose.

**Compile-validate-retry loop:** before any generated shader reaches the UI
or disk, it is compiled in a headless/offscreen WebGL context in the
Electron main process. On compile failure, the compiler error is fed back
to Claude verbatim for up to 2 automatic retries. Only after retries are
exhausted does the user see a failure state ("couldn't generate that — try
rephrasing"). This is the primary reliability mechanism for the single
riskiest part of the system: LLM-generated GLSL that doesn't compile.

**Tweak paths:**
- *Param tweak* ("make it slower"): a cheap classification call maps the
  instruction to an existing exposed uniform and new value. Applied live in
  the preview instantly — no shader regeneration, no compile step.
- *Structural tweak* ("add fog"): routed through the same generate →
  compile-validate-retry loop as a fresh generation, with current shader
  code + param schema + the instruction as context. Returns a new (possibly
  extended) shader and param schema.

**Stills:** identical pipeline. When the described idea reads as a single
composition rather than motion (`isAnimated: false` in structured output,
or user-specified), the app renders one frame at native resolution ×
devicePixelRatio, captured via `toBlob` as PNG, instead of looping it.

### 2. CWE App (Electron + TypeScript + React)

The user-facing app: prompt box, live WebGL preview pane (runs the exact
generated shader via `requestAnimationFrame` — what's previewed is what
gets applied), a slider panel for exposed tunable params, a gallery of past
generations, and Apply/Revert controls.

### 3. Desktop Integration Layer (wrapper around Lively Wallpaper's CLI)

Packages a generated shader into the folder format Lively expects
(`index.html` + shader + `LivelyProperties.json`). Lively natively supports
slider/color/checkbox custom properties defined in `LivelyProperties.json`
— this maps directly onto the Generation Engine's param schema, so Lively's
own settings panel comes "for free" as a secondary way to tweak params
outside the CWE app. The layer then shells out to Lively's CLI to apply the
package in **Span** mode across all monitors (or the static-image path for
stills) and to query/restore previous state for revert.

## Pinning Mechanism — Decision & Rationale

Windows 11 has no supported API for placing content behind desktop icons;
doing so requires inserting a window into the undocumented `WorkerW` layer
(the mechanism Wallpaper Engine and similar tools use). Rather than
reimplementing and maintaining this hack, CWE depends on **Lively
Wallpaper** (MIT-licensed, open source, actively maintained), which already
solves WorkerW placement, per-monitor/span layout, and static-image
fallback. CWE owns the actually novel part — text-to-scene-code generation
and the tweak/gallery UX — not the Windows internals hack. If Lively is
ever abandoned or breaks across a Windows update, CWE is blocked until it's
fixed or replaced; this is an accepted risk for a local, hobby-scale tool
(see Risks).

## Storage & Gallery

Local files only, no database server:

```
C:\projects\CWE\data\wallpapers\<id>\
  shader.frag
  params.json      # tunable uniform schema + current values
  thumbnail.png
  meta.json        # prompt text, tweak lineage, isAnimated, createdAt
```

A flat `index.json` lists all entries for the gallery grid. Human-inspectable, no DB needed for a single-user local tool.

**Revert** is a separate small stack from the gallery: every Apply pushes
the previously-active state onto it (including a one-time snapshot, on
first run, of whatever wallpaper was active before CWE was ever used).
Revert pops the stack and re-applies through the Desktop Integration Layer.
The gallery itself doubles as "revert to any past result" since any entry
can be re-applied directly.

## Milestones

Each milestone is runnable end-to-end (or a clear vertical slice) so the
system can be tested throughout, per the working requirement to keep it
runnable at every step.

1. **M0 — De-risking spike.** No product code. Install Node.js + Lively
   Wallpaper. Manually verify: Lively's CLI can set a static image; a
   hand-written HTML/WebGL page renders live behind desktop icons; **Span
   mode behaves correctly across the real 3-monitor mixed-resolution
   layout.** This validates the riskiest assumption before any other work
   starts.
2. **M1 — Mechanical path proven.** A hand-written shader → packaged into
   Lively's folder format → applied via CLI → visible live behind icons on
   the primary monitor. Script-driven, no AI, no UI.
3. **M2 — Generation Engine.** Claude API → shader + param schema, with the
   compile-validate-retry loop, usable from a CLI/test harness.
4. **M3 — First real usable version.** Electron shell: prompt box → live
   preview (M2) → Apply button (M1's mechanism).
5. **M4 — Tweaking.** Param sliders wired to live uniforms; structural
   tweaks routed back through generation.
6. **M5 — Gallery, history, revert, stills.**
7. **M6 — Multi-monitor polish.** Wire the Span behavior validated in M0
   into the real apply flow; DPI/resolution correctness pass across the
   actual monitor layout.

## Testing Strategy

TDD applies where determinism allows it. Pure logic with mockable
boundaries gets tests written first:
- Compile-validate-retry loop (mock WebGL compile results and Claude
  responses to exercise retry/failure branches deterministically).
- Structured-output parsing/validation.
- Param-tweak classification (instruction → param + value mapping).
- Lively package-folder generation (file structure, `LivelyProperties.json`
  shape) against fixtures.

Actual Claude output *quality* and actual Lively/Windows rendering behavior
are not practically unit-testable (non-deterministic / hardware-dependent).
These are covered by M0's manual validation spike and a manual smoke-test
checklist at each subsequent milestone — called out explicitly rather than
claiming automated coverage that doesn't exist.

## Risks & External Dependencies

| Dependency | Type | Notes |
|---|---|---|
| Lively Wallpaper | Free, local, third-party | Not bundled — installed separately. M0 validates its actual behavior (especially Span mode across mismatched resolutions) before any product code depends on it. |
| Claude API | **Paid, cloud** | The one paid/cloud dependency in the system, isolated entirely to the Generation Engine. Requires `ANTHROPIC_API_KEY`. Cost is per-generation and small, but real. No local-LLM fallback in v1. |
| Node.js | Free, local | Required for Electron; not installed as of this writing. |
| .NET SDK | Not required | Lively is consumed as a pre-built external app, not forked or built from source. |

**Accepted limitation:** the WorkerW pinning hack is Lively's maintenance
burden, not CWE's. If a future Windows update breaks it, CWE is blocked
until Lively updates. Acceptable for a local, single-user tool.

## Key Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Desktop pinning | Depend on Lively Wallpaper | Eliminates the single riskiest unknown (undocumented WorkerW hack); focuses effort on the novel part |
| Codegen backend | Claude API | Best quality for creative shader code; paid dependency clearly isolated and flagged |
| Static wallpapers | Rendered frame from generated shader code | Keeps everything code-rendered; no diffusion-model dependency |
| Multi-monitor | Single scene spanned across all monitors | Matches the user's actual 3-monitor setup; simplest generation model |
| Iteration/tweaking | Hybrid: live exposed params + LLM fallback for structural changes | Instant feedback for common tweaks, full flexibility for anything else |
| App interface | Standalone Electron desktop app | Persistent, visual, supports gallery/preview/history |
| App stack | Electron + TypeScript + React | Matches the web-based scene format; Chromium preview parity with Lively's WebView2 renderer |
| Scene format | Single fullscreen GLSL fragment shader | Best fit for the target aesthetic (procedural/atmospheric); most reliable format for LLM generation |
