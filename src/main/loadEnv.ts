import * as fs from 'fs';

/**
 * Minimal .env reader for the main process.
 *
 * Deliberately hand-rolled rather than pulling in dotenv: this project runs on
 * four runtime dependencies, and the whole feature is one regex plus a loop. It
 * supports what a .env holding an API key needs — KEY=VALUE, # comments, blank
 * lines, optional surrounding quotes, CRLF — and nothing more. It is not a
 * general dotenv replacement: no interpolation, no multi-line values, no export
 * prefixes.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (key === '') continue;

    // Everything after the first '=' is the value, so values may contain '='.
    let value = line.slice(separator + 1).trim();
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);

    values[key] = value;
  }

  return values;
}

/**
 * Applies a .env file to process.env, if it exists.
 *
 * Variables already present in the environment are left alone: exporting a key
 * in the shell is the more deliberate act and is what the documented end-to-end
 * recipe uses, so it must win over whatever a stale file happens to contain.
 */
export function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf-8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
