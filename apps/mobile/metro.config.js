const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 52+ detects PNPM workspaces automatically. Keeping manual
// watchFolders/nodeModulesPaths here can make release bundling resolve a
// different dependency graph than native autolinking.
module.exports = getDefaultConfig(__dirname);
