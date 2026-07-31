import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseEnvFile, loadEnvFile } from '../../src/main/loadEnv';

describe('parseEnvFile', () => {
  it('reads KEY=VALUE pairs', () => {
    expect(parseEnvFile('ANTHROPIC_API_KEY=sk-ant-abc123')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-abc123' });
  });

  it('ignores blank lines and # comments', () => {
    const parsed = parseEnvFile(['# a comment', '', '  ', 'A=1', '   # indented comment', 'B=2'].join('\n'));
    expect(parsed).toEqual({ A: '1', B: '2' });
  });

  it('keeps everything after the first = so values containing = survive', () => {
    expect(parseEnvFile('TOKEN=abc=def==')).toEqual({ TOKEN: 'abc=def==' });
  });

  it('strips surrounding single or double quotes and trims whitespace', () => {
    const parsed = parseEnvFile(['A = "quoted" ', "B='single'", 'C=  bare  '].join('\n'));
    expect(parsed).toEqual({ A: 'quoted', B: 'single', C: 'bare' });
  });

  it('tolerates CRLF line endings', () => {
    expect(parseEnvFile('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });

  it('ignores lines with no =', () => {
    expect(parseEnvFile('JUST_A_NAME\nA=1')).toEqual({ A: '1' });
  });
});

describe('loadEnvFile', () => {
  let dir: string;
  const KEY = 'CWE_TEST_ENV_VAR';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwe-env-'));
    delete process.env[KEY];
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env[KEY];
  });

  it('applies values from the file to process.env', () => {
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, `${KEY}=from-file`, 'utf-8');

    loadEnvFile(file);

    expect(process.env[KEY]).toBe('from-file');
  });

  // A key exported in the shell is the more deliberate act, and is what the
  // ledger's documented e2e recipe uses — it must win over a stale file.
  it('does not overwrite a variable that is already set', () => {
    process.env[KEY] = 'from-shell';
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, `${KEY}=from-file`, 'utf-8');

    loadEnvFile(file);

    expect(process.env[KEY]).toBe('from-shell');
  });

  it('does nothing when the file does not exist', () => {
    expect(() => loadEnvFile(path.join(dir, 'nope.env'))).not.toThrow();
    expect(process.env[KEY]).toBeUndefined();
  });
});
