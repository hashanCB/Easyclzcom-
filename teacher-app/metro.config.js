const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

// Force a single copy of react / react-dom / scheduler so transitive deps
// (use-sync-external-store, react-hook-form, etc.) don't pull in their own
// nested React 18 and trigger "Invalid hook call" duplicate-React errors.
const SINGLETONS = new Set([
  'react',
  'react-dom',
  'scheduler',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
]);
const rootPkg = path.join(projectRoot, 'package.json');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SINGLETONS.has(moduleName)) {
    return context.resolveRequest(
      { ...context, originModulePath: rootPkg },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
