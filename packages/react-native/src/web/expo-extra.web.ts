/**
 * Read the web engine's configuration out of the Expo app config.
 *
 * The Expo config plugin writes `extra.c15t` from the same options it writes
 * into the native binary, so a universal app configures c15t once.
 */

import type { AllConsentNames } from '../protocol/vocabulary';

/**
 * The web engine's configuration: the values the Expo config plugin writes to
 * the binary for iOS and Android, and to `extra.c15t` for web.
 *
 * The plugin writes it to `extra.c15t`; {@link webOptionsFromManifest} reads it.
 */
export interface WebConsentOptions {
	/**
	 * The project URL from your Inth dashboard, such as
	 * `https://your-project.inth.app`. It follows the rule the plugin applies:
	 * with `dryRun`, any `https` URL or `http` on a loopback host also passes.
	 */
	readonly backendURL: string;
	/**
	 * Drop consent records instead of sending them. A production web bundle
	 * refuses it, as a native release build does: every read answers deny-all.
	 *
	 * @default false
	 */
	readonly dryRun?: boolean;
	/** The `domain` sent with subject writes. */
	readonly domain?: string | null;
	/**
	 * The categories the app declares. They narrow the policy's scope and grant
	 * nothing. Omit them to use the policy's scope.
	 */
	readonly consentCategories?: readonly AllConsentNames[] | null;
	/** Report a GPC signal, as the plugin's `forceGPC` does on a test build. */
	readonly forceGPC?: boolean;
}

/**
 * The web configuration in an Expo app config, or `null` when it has none.
 *
 * @param manifest - The public app config, as an object or as the JSON text
 *   Expo's bundler inlines.
 * @returns The options `extra.c15t` carries.
 */
export const webOptionsFromManifest = function webOptionsFromManifest(
	manifest: unknown
): WebConsentOptions | null {
	let config = manifest;
	if (typeof config === 'string') {
		try {
			config = JSON.parse(config) as unknown;
		} catch {
			return null;
		}
	}
	if (typeof config !== 'object' || config === null) {
		return null;
	}
	const { extra } = config as { readonly extra?: unknown };
	const c15t =
		typeof extra === 'object' && extra !== null
			? (extra as Record<string, unknown>).c15t
			: undefined;
	if (typeof c15t !== 'object' || c15t === null) {
		return null;
	}
	const { backendURL, consentCategories, domain, dryRun, forceGPC } =
		c15t as Record<string, unknown>;
	if (typeof backendURL !== 'string') {
		return null;
	}
	return {
		backendURL,
		consentCategories: Array.isArray(consentCategories)
			? (consentCategories as WebConsentOptions['consentCategories'])
			: null,
		domain: typeof domain === 'string' ? domain : null,
		dryRun: dryRun === true,
		forceGPC: forceGPC === true,
	};
};
