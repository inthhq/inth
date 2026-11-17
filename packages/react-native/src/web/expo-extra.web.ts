/**
 * Read the web engine's configuration out of the Expo app config.
 *
 * The Expo config plugin writes `extra.inth` from the same options it writes
 * into the native binary, so a universal app configures Inth once.
 */

import type { AllConsentNames } from '../protocol/vocabulary';

/**
 * The web engine's configuration: the values the Expo config plugin writes to
 * the binary for iOS and Android, and to `extra.inth` for web.
 *
 * The plugin writes it to `extra.inth`; {@link webOptionsFromManifest} reads it.
 */
export interface WebConsentOptions {
	/**
	 * The project URL from your Inth dashboard, such as
	 * `https://your-project.inth.app`. It follows the rule the plugin applies:
	 * with `dryRun`, any `https` URL or `http` on a loopback host also passes.
	 */
	readonly projectUrl: string;
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
 * @returns The options `extra.inth` carries.
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
	const inth =
		typeof extra === 'object' && extra !== null
			? (extra as Record<string, unknown>).inth
			: undefined;
	if (typeof inth !== 'object' || inth === null) {
		return null;
	}
	const { projectUrl, consentCategories, domain, dryRun, forceGPC } =
		inth as Record<string, unknown>;
	if (typeof projectUrl !== 'string') {
		return null;
	}
	return {
		consentCategories: Array.isArray(consentCategories)
			? (consentCategories as WebConsentOptions['consentCategories'])
			: null,
		domain: typeof domain === 'string' ? domain : null,
		dryRun: dryRun === true,
		forceGPC: forceGPC === true,
		projectUrl,
	};
};
