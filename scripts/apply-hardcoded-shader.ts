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
