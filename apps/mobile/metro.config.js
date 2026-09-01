const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// The data artifacts are opaque binaries, not source: Metro has to treat them
// as assets or it will try to parse them as JavaScript.
config.resolver.assetExts.push('pmtiles', 'sqlite');

// Monorepo: rules-core and city-montreal are imported straight from source.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
