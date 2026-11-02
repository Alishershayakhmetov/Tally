const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are bundled as .sql sources.
config.resolver.sourceExts.push('sql');

// expo-sqlite on web (alpha) loads SQLite as wasm. It also needs
// cross-origin isolation headers, set via the expo-router plugin in app.json.
config.resolver.assetExts.push('wasm');

// The Windows app (desktop/) runs the web build inside Electron, where SQLite
// lives in the main process (better-sqlite3). Its build sets TALLY_DESKTOP=1,
// which swaps expo-sqlite for a stand-in that talks to it. Phones and a plain
// web build are untouched.
if (process.env.TALLY_DESKTOP === '1') {
  const path = require('node:path');
  const standIn = path.join(__dirname, 'src', 'desktop', 'sqlite.ts');
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web' && (moduleName === 'expo-sqlite' || moduleName.startsWith('expo-sqlite/'))) {
      return { type: 'sourceFile', filePath: standIn };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
