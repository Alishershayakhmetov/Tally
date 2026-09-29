const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are bundled as .sql sources.
config.resolver.sourceExts.push('sql');

// expo-sqlite on web (alpha) loads SQLite as wasm. It also needs
// cross-origin isolation headers, set via the expo-router plugin in app.json.
config.resolver.assetExts.push('wasm');

module.exports = config;
