import {
	withGradleProperties,
	withPodfileProperties,
} from '@expo/config-plugins';
import type { AndroidConfig, ConfigPlugin } from '@expo/config-plugins';

import { C15tPluginError } from './errors';

/**
 * The build property both native builds read: `Podfile.properties.json` for
 * `C15tReactNative.podspec`, `gradle.properties` for `library.gradle`. `false`
 * leaves the stock consent screens out of the binary.
 */
export const NATIVE_UI_PROPERTY = 'c15t.nativeUI';

/**
 * Validate the `nativeUI` prop.
 *
 * `nativeUI: false` with a `theme` is refused: the theme styles screens the
 * build would not contain, so one of the two is a mistake.
 *
 * @param value - The `nativeUI` prop.
 * @param theme - The `theme` prop.
 * @returns Whether the build links the stock consent screens.
 * @throws {C15tPluginError} When the value is not a boolean, or `false` with a theme.
 */
export const resolveNativeUI = function resolveNativeUI(
	value: unknown,
	theme: unknown
): boolean {
	if (value === undefined) {
		return true;
	}
	if (typeof value !== 'boolean') {
		throw new C15tPluginError(
			`nativeUI must be true or false. Got ${JSON.stringify(value) ?? 'undefined'}.`
		);
	}
	if (!value && theme !== undefined) {
		throw new C15tPluginError(
			'nativeUI: false leaves the stock consent screens out of the build, so ' +
				'theme would style nothing. Remove theme, or pass the same object to ' +
				'createConsentTheme for the React Native components.'
		);
	}
	return value;
};

/**
 * Write or clear the property in `Podfile.properties.json`.
 *
 * @param properties - The parsed file.
 * @param nativeUI - Whether the build links the stock screens.
 * @returns The properties to write back.
 */
export const applyNativeUIPodfileProperties =
	function applyNativeUIPodfileProperties(
		properties: Record<string, string>,
		nativeUI: boolean
	): Record<string, string> {
		const next = { ...properties };
		Reflect.deleteProperty(next, NATIVE_UI_PROPERTY);
		if (!nativeUI) {
			next[NATIVE_UI_PROPERTY] = 'false';
		}
		return next;
	};

/**
 * Write or clear the property in `gradle.properties`.
 *
 * @param items - The parsed file.
 * @param nativeUI - Whether the build links the stock screens.
 * @returns The items to write back.
 */
export const applyNativeUIGradleProperties =
	function applyNativeUIGradleProperties(
		items: AndroidConfig.Properties.PropertiesItem[],
		nativeUI: boolean
	): AndroidConfig.Properties.PropertiesItem[] {
		const next = items.filter(
			(item) => item.type !== 'property' || item.key !== NATIVE_UI_PROPERTY
		);
		if (!nativeUI) {
			next.push({ key: NATIVE_UI_PROPERTY, type: 'property', value: 'false' });
		}
		return next;
	};

/**
 * Register the property on both platforms. The stock build clears a value a
 * previous prebuild wrote, so turning `nativeUI` back on needs no manual step.
 */
export const withC15tNativeUI: ConfigPlugin<boolean> = (config, nativeUI) => {
	const next = withPodfileProperties(config, (cfg) => ({
		...cfg,
		modResults: applyNativeUIPodfileProperties(cfg.modResults, nativeUI),
	}));
	return withGradleProperties(next, (cfg) => ({
		...cfg,
		modResults: applyNativeUIGradleProperties(cfg.modResults, nativeUI),
	}));
};
