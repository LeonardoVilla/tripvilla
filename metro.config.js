// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle WebAssembly files required by expo-sqlite on web
config.resolver.assetExts.push('wasm');

module.exports = config;
