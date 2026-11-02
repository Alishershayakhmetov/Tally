// Exports the app's web build into desktop/web/, for the Electron window.
// TALLY_DESKTOP=1 makes Metro swap expo-sqlite for the bridge to better-sqlite3
// (metro.config.js). --clear drops Metro's cache, which would otherwise keep
// the version of the bundle made without the swap.

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const desktop = join(import.meta.dirname, '..');
const root = join(desktop, '..');
const output = join(desktop, 'web');

rmSync(output, { recursive: true, force: true });
const windows = process.platform === 'win32';
execFileSync(
  windows ? 'npx.cmd' : 'npx',
  ['expo', 'export', '--platform', 'web', '--output-dir', output, '--clear'],
  { cwd: root, stdio: 'inherit', shell: windows, env: { ...process.env, TALLY_DESKTOP: '1', CI: '1' } },
);
console.log(`\nWeb build ready in ${output}`);
