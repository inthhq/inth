import * as configPlugins from '@expo/config-plugins';

type ConfigPlugins = typeof configPlugins;

/**
 * `@expo/config-plugins` defines `AndroidConfig` and `IOSConfig` as lazy
 * CommonJS getters. Node 22's CommonJS export detection cannot see them, so a
 * named ESM import of either throws when the plugin loads there. The namespace
 * import still loads, and Node keeps the full `module.exports` under
 * `default`, so read the two helpers from there when the named binding is
 * missing.
 *
 * @internal
 */
const loaded: ConfigPlugins =
	configPlugins.AndroidConfig === undefined
		? (configPlugins as unknown as { default: ConfigPlugins }).default
		: configPlugins;

/**
 * `AndroidConfig` from `@expo/config-plugins`, safe on Node 22.
 *
 * @internal
 */
export const androidConfig: ConfigPlugins['AndroidConfig'] =
	loaded.AndroidConfig;

/**
 * `IOSConfig` from `@expo/config-plugins`, safe on Node 22.
 *
 * @internal
 */
export const iosConfig: ConfigPlugins['IOSConfig'] = loaded.IOSConfig;
