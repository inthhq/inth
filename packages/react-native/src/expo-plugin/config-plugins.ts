import { createRequire } from 'node:module';

import type * as ConfigPluginsModule from 'expo/config-plugins';

import { InthPluginError } from './errors';

type ConfigPlugins = typeof ConfigPluginsModule;

/**
 * The app's own `@expo/config-plugins`, reached through `expo/config-plugins`.
 *
 * Mods, the prebuild template and the helpers differ between Expo SDKs, so the
 * plugin must register its mods through the copy the app's `expo` re-exports,
 * never a copy of its own. That is why every value import from the library
 * goes through this module; type imports can name `expo/config-plugins`
 * directly because they are erased.
 *
 * It is a `require` rather than an `import` for two reasons. `expo` has no
 * `exports` map before SDK 58, so the ES module specifier
 * `expo/config-plugins` does not resolve there, while SDK 58's map only
 * resolves the extensionless one. The CommonJS resolver handles both. And
 * `@expo/config-plugins` defines `AndroidConfig` and `IOSConfig` as lazy
 * CommonJS getters that Node 22's export detection cannot see, so a named ES
 * import of either throws on Node 22; `require` returns the real
 * `module.exports` with the getters intact.
 *
 * The anchor is `import.meta.filename` (Node 20.11+, below every Expo SDK's
 * floor) rather than `import.meta.url`: the CommonJS build turns it into a
 * plain `__filename`, where the `import.meta.url` shim guesses from `document`.
 *
 * @internal
 */
const loadConfigPlugins = function loadConfigPlugins(): ConfigPlugins {
	try {
		return createRequire(import.meta.filename)(
			'expo/config-plugins'
		) as ConfigPlugins;
	} catch (error) {
		// A workspace can install this package where it cannot see the app's
		// `expo`, such as a hoisted root with `expo` only in the app.
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'MODULE_NOT_FOUND'
		) {
			throw new InthPluginError(
				'cannot find expo/config-plugins from where @inth/react-native is installed. expo is a peer dependency: install @inth/react-native and expo so that the package can resolve expo, for example both in the app package.',
				undefined,
				{ cause: error }
			);
		}
		throw error;
	}
};

const configPlugins = loadConfigPlugins();

/** @internal */
export const {
	createRunOncePlugin,
	withAndroidManifest,
	withAppBuildGradle,
	withDangerousMod,
	withFinalizedMod,
	withGradleProperties,
	withInfoPlist,
	withMainApplication,
	withPodfile,
	withPodfileProperties,
	withProjectBuildGradle,
	withXcodeProject,
} = configPlugins;

/**
 * `AndroidConfig` from the app's `@expo/config-plugins`.
 *
 * @internal
 */
export const androidConfig: ConfigPlugins['AndroidConfig'] =
	configPlugins.AndroidConfig;

/**
 * `IOSConfig` from the app's `@expo/config-plugins`.
 *
 * @internal
 */
export const iosConfig: ConfigPlugins['IOSConfig'] = configPlugins.IOSConfig;
