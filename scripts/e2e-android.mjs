// Builds a release APK of the current code and installs it on the running
// emulator (or USB device), for the Maestro flows in .maestro/.
//
//   node scripts/e2e-android.mjs           prebuild if needed, build, install
//   node scripts/e2e-android.mjs --clean   regenerate android/ first
//   node scripts/e2e-android.mjs --no-install   build only
//
// E2E_GOOGLE_CDN=1 fetches Google's Maven artifacts through Google's alternate
// CDN (scripts/google-cdn.init.gradle) for networks where dl.google.com is slow.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const windows = process.platform === 'win32';
const sdk =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  (windows
    ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
    : join(process.env.HOME ?? '', 'Android', 'Sdk'));
const env = { ...process.env, ANDROID_HOME: sdk };

function run(command, args, cwd = root) {
  // Windows runs .bat/.cmd through a shell, which splits unquoted paths at spaces.
  const quote = (arg) => (windows && /\s/.test(arg) ? `"${arg}"` : arg);
  console.log(`\n> ${command} ${args.join(' ')}`);
  execFileSync(quote(command), args.map(quote), { cwd, env, stdio: 'inherit', shell: windows });
}

// 1. android/ is generated (Continuous Native Generation) and gitignored.
if (process.argv.includes('--clean') || !existsSync(join(root, 'android'))) {
  // Prebuild rewrites the "android"/"ios" npm scripts; this project keeps its own.
  const packageJson = readFileSync(join(root, 'package.json'), 'utf8');
  try {
    run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', '--clean']);
  } finally {
    writeFileSync(join(root, 'package.json'), packageJson);
  }
}

// 2. Release build: the JS bundle is inside the APK, so no dev server is needed.
// Native code is compiled only for the connected device's CPU (x86_64 on the
// emulator) instead of all four ABIs, which makes the build several times faster.
const adb = join(sdk, 'platform-tools', windows ? 'adb.exe' : 'adb');
let abi = '';
try {
  abi = execFileSync(adb, ['shell', 'getprop', 'ro.product.cpu.abi'], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  // No device: build every ABI.
}
const gradleArgs = ['assembleRelease', '--console=plain'];
if (/^[\w-]+$/.test(abi)) gradleArgs.push(`-PreactNativeArchitectures=${abi}`);
if (process.env.E2E_GOOGLE_CDN === '1') {
  gradleArgs.push('--init-script', join(root, 'scripts', 'google-cdn.init.gradle'));
}
// An absolute path: cmd may be set not to search the current directory.
run(join(root, 'android', windows ? 'gradlew.bat' : 'gradlew'), gradleArgs, join(root, 'android'));

// 3. Install on whatever adb sees (start the emulator first), unless --no-install.
const apk = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (process.argv.includes('--no-install')) {
  console.log(`\nBuilt ${apk}`);
} else {
  run(adb, ['install', '-r', apk]);
  console.log(`\nInstalled ${apk}`);
}
