import { setupColorScheme } from '@inth/sdk/ui/utils';

import type { ConsentConfig } from './config';

/** `key` of the Nuxt head script that sets the class before first paint. */
export const COLOR_SCHEME_SCRIPT_KEY = 'inth-color-scheme';

const noop = (): void => undefined;

/**
 * Keep the `inth-dark` class on `<html>` in line with `colorScheme`, the
 * way the React and Svelte providers do.
 *
 * `'light'` and `'dark'` set the class once. `'system'` follows
 * `prefers-color-scheme` as it changes. Unset mirrors a `dark` class on
 * `<html>` as it changes. `null` does nothing.
 *
 * Does nothing on the server. Where `matchMedia` is missing, as in a few
 * embedded webviews, `'system'` is light.
 *
 * @returns A function that stops following the system or the `dark` class.
 * @internal
 */
export const applyColorScheme = function applyColorScheme(
	colorScheme: ConsentConfig['colorScheme']
): () => void {
	if (colorScheme === null || typeof document === 'undefined') {
		return noop;
	}
	return setupColorScheme(colorScheme);
};
