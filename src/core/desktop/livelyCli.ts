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
  // split/join rather than replace/replaceAll: both of those treat `$&`, `$1` etc.
  // as substitution patterns in the replacement, and a Windows path is arbitrary
  // user-configured text. This substitutes literally, and for every occurrence.
  return config.setWallpaperArgs.map((arg) => arg.split('{path}').join(packageFolder));
}

export async function setWallpaper(config: LivelyCliConfig, packageFolder: string): Promise<void> {
  const args = buildWallpaperArgs(config, packageFolder);
  await execFileAsync(config.executablePath, args);
}
