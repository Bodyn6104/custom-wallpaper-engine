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
