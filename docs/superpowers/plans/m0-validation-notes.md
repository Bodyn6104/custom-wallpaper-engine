# M0 Validation Notes

**Date:** 2026-07-21
**Result: GO — proceed to M1**, with several corrections to the plan recorded below.

## Environment

- Node.js installed: v24.18.0 LTS via `winget install --id OpenJS.NodeJS.LTS`
- Lively Wallpaper installed: v2.2.1.0 via `winget install --id rocksdanister.LivelyWallpaper`
  (this pulled in `Microsoft.VCRedist.2015+.x64` and `Microsoft.EdgeWebView2Runtime` as
  dependencies automatically — Lively's web wallpaper renderer is WebView2/Chromium-based,
  confirming WebGL1 support is available.)
- Install location: `C:\Program Files\Lively Wallpaper\Lively.exe`
- Two processes run at all times once launched: `Lively` (core) and `Lively.UI.WinUI` (UI).
- Logs: `%LOCALAPPDATA%\Lively Wallpaper\logs\<timestamp>.txt`

## Verified: CLI command to set a wallpaper

```
"C:\Program Files\Lively Wallpaper\Lively.exe" setwp --file "<path>"
```

**Critical correction to the original plan:** `<path>` must point to a folder that
already exists inside Lively's own Library —
`%LOCALAPPDATA%\Lively Wallpaper\Library\wallpapers\<any-folder-name>\`. Pointing
`setwp --file` at an arbitrary external path (e.g. a temp folder elsewhere on disk)
does **nothing** — no error, no log entry, it's silently a no-op. This was the
source of significant confusion during validation (see "What didn't work" below).

The wiki (github.com/rocksdanister/lively/wiki/Command-Line-Controls) states
arbitrary external paths work; that did not hold for this version (v2.2.1.0,
"desktop-native" build). Treat the wiki as unreliable for this version and trust
this empirical finding instead.

**Implication for the Desktop Integration Layer (plan Tasks 3, 4, 13):** instead of
writing a package to an arbitrary temp/data folder and pointing Lively at it, the
package must be written directly into a new subfolder under
`%LOCALAPPDATA%\Lively Wallpaper\Library\wallpapers\`, then `setwp --file` called on
that path.

## Verified: LivelyInfo.json is required and has a specific schema

A folder is only a valid Lively wallpaper package if it contains a `LivelyInfo.json`.
The original plan's `buildLivelyPackage` (Task 3) did not write this file at all —
that gap would have made every generated package invisible to Lively. Real schema,
confirmed against a shipped sample wallpaper package
(`rocksdanister/WebGL-Fluid-Simulation`, fetched from its `lively` branch):

```json
{
  "AppVersion": "2.2.1.0",
  "Title": "CWE M0 Test",
  "Thumbnail": "thumbnail.jpg",
  "Preview": "preview.jpg",
  "Desc": "M0 mechanical validation test wallpaper",
  "Author": "CWE",
  "License": "",
  "Contact": "",
  "Type": 1,
  "Arguments": "",
  "FileName": "index.html"
}
```

`Type: 1` = web/HTML wallpaper (confirmed against a real shipped HTML+WebGL sample).
`Thumbnail`/`Preview` must reference files that actually exist in the package folder
— empty strings there contributed to an early failure (see below). `FileName` is the
entry-point HTML file Lively loads.

## Verified: LivelyProperties.json schema — colors are hex strings, not arrays

Confirmed against two real shipped packages. The original plan's `buildLivelyProperties`
assumed color values were `[r, g, b]` number arrays (0–1 range) — **wrong**. Real format:

```json
{
  "speed": { "type": "slider", "min": 0, "max": 3, "text": "Speed", "value": 1 },
  "tint": { "type": "color", "text": "Tint", "value": "#C0C0C0" }
}
```

Colors are `"#RRGGBB"` hex strings. The generated `index.html`'s JS must parse this
hex string into normalized floats before passing it to the shader as a `vec3`
uniform — the original plan's uniform-setting code (`gl.uniform3fv` fed straight from
`values[name]`) assumed an array and needs a hex-to-float conversion step.

Also confirmed: the callback contract is exactly
`window.livelyPropertyListener = function(name, val) { ... }` (not `newVal` or any
other name) — matches what the plan already had. **Also confirmed:** "Property class
names must start with lowercase letters" — the Claude system prompt (Task 6) should
say so explicitly to guarantee generated param names comply.

## Verified: setting the multi-monitor layout mode

```
"C:\Program Files\Lively Wallpaper\Lively.exe" --layout span
```

Also available: `--layout per` (per-display, independent wallpaper per monitor) and
`--layout duplicate` (same wallpaper mirrored on every monitor). This command closes
any running wallpaper, so re-run `setwp --file <path>` afterward to reapply.

## What didn't work (and why, for the record)

1. **Drag-and-drop of a folder onto the Lively window:** no visible effect either way
   (not confirmed as broken, just abandoned once the CLI path was validated —
   folder drag-and-drop may simply be unsupported, as distinct from file
   drag-and-drop).
2. **The "+" Add Wallpaper GUI wizard, selecting `index.html` from a folder that
   already contained a hand-written `LivelyInfo.json`:** failed with an error the UI
   displayed as "LivelyInfo.json file was not found" — but the actual logged
   exception was the **opposite**:
   `InvalidOperationException: A LivelyInfo.json file was found in this project
   folder. It looks like this project is already packaged. To create a new project,
   please remove the existing LivelyInfo.json first.` (thrown by
   `WallpaperLibraryFactory.CreateWallpaperPackage`). The GUI's error dialog text is
   misleading/wrong for this case. **Root cause:** the "+" wizard's job is to build a
   *new* package from a loose content file (auto-generating `LivelyInfo.json` for
   you) — it explicitly refuses when one already exists, and there is no GUI path
   for importing an already-packaged folder. This is fine: our Desktop Integration
   Layer builds fully-formed packages programmatically and drops them straight into
   the Library folder via the CLI, sidestepping the GUI wizard entirely.
3. **Selecting `LivelyInfo.json` directly in the "+" wizard's file picker:** "format
   not supported" — the wizard's content-type filter doesn't recognize `.json` as an
   importable wallpaper source, as expected once (2) was understood.

## End-to-end confirmation (both critical assumptions)

- A hand-written HTML/canvas animation, placed directly into
  `Library\wallpapers\<id>\` (bypassing the GUI entirely) and activated via
  `setwp --file`, **rendered live behind desktop icons** on the primary monitor —
  confirmed visually by the user.
- With `--layout span` set, the same package **spanned correctly as one continuous
  canvas across all 3 real monitors** (2560×1440 primary, 2560×1440 second,
  1920×1080 third, at their actual relative positions) — confirmed visually by the
  user, not stretched/duplicated/misaligned.

## Corrections to fold into the implementation plan before Task 2 starts

1. **Task 3 (`livelyPackage.ts`):** add a `buildLivelyInfo()` function writing the
   verified `LivelyInfo.json` schema above; `buildLivelyPackage` must write it
   alongside `index.html` and `LivelyProperties.json`. Requires generating (or
   accepting) `Thumbnail`/`Preview` file references that actually exist — simplest
   fix is a solid-color placeholder image written at package-build time.
2. **Task 3 (`livelyPackage.ts` / `buildLivelyProperties`):** color params must
   serialize as `"#RRGGBB"` hex strings, not arrays. The generated `index.html`'s
   uniform-setting JS must parse that hex string into a normalized float triple
   before calling `gl.uniform3fv`.
3. **Task 4/13 (`livelyCli.ts` / apply flow):** the apply handler must write the
   package directly into a fresh subfolder under
   `%LOCALAPPDATA%\Lively Wallpaper\Library\wallpapers\`, not an arbitrary output
   directory — `buildLivelyPackage`'s `outDir` argument must be computed from that
   path (via Electron's `app.getPath` is not right here since this is a fixed OS/app
   path, not our own app's userData — resolve via `process.env.LOCALAPPDATA` +
   `Lively Wallpaper\Library\wallpapers`).
4. **Task 6 (`claudeClient.ts` system prompt):** add an explicit instruction that
   param names must start with a lowercase letter, matching Lively's requirement.
5. **`scripts/lively-cli-config.json`:** real verified values, see below.
