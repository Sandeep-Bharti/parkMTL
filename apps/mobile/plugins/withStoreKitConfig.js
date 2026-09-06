const { withXcodeProject } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Attach the local StoreKit configuration to the Run scheme.
 *
 * Without this, purchases cannot be exercised in the simulator at all: StoreKit
 * has no products unless a configuration file is selected, and that selection
 * lives in `ios/…/xcshareddata/xcschemes/*.xcscheme`, inside the generated
 * `ios/` directory. `expo prebuild --clean` deletes that directory, so a
 * manually selected file is silently lost on the next prebuild — which is how
 * the Ekadashi app does it, and why its setup guide has to tell you to
 * re-select it by hand.
 *
 * Doing it here means the local purchase flow keeps working across prebuilds
 * without anyone remembering a manual step. It affects the *scheme* only, so it
 * changes nothing about a release build or the real App Store products.
 */
const withStoreKitConfig = (config, { configPath = 'parkmtl.storekit' } = {}) =>
  withXcodeProject(config, (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const platformRoot = cfg.modRequest.platformProjectRoot;
    const name = cfg.modRequest.projectName;

    if (!fs.existsSync(path.join(projectRoot, configPath))) {
      // Nothing to attach. Not an error: a build without the file is a build
      // that simply cannot do local StoreKit testing.
      return cfg;
    }

    const scheme = path.join(
      platformRoot,
      `${name}.xcodeproj`,
      'xcshareddata',
      'xcschemes',
      `${name}.xcscheme`,
    );
    if (!fs.existsSync(scheme)) return cfg;

    const xml = fs.readFileSync(scheme, 'utf8');
    if (xml.includes('StoreKitConfigurationFileReference')) return cfg;

    // Relative to the scheme file, which sits three directories inside ios/.
    const reference =
      `      <StoreKitConfigurationFileReference\n` +
      `         identifier = "../../../${configPath}">\n` +
      `      </StoreKitConfigurationFileReference>\n`;

    // The reference belongs inside LaunchAction, which is what "Run" uses.
    const updated = xml.replace(
      /(<LaunchAction[\s\S]*?>\n)/,
      (match) => `${match}${reference}`,
    );

    fs.writeFileSync(scheme, updated);
    return cfg;
  });

module.exports = withStoreKitConfig;
