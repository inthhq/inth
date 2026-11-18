/**
 * The app's consent client, on web.
 *
 * The `.web` twin of `client.ts`. Bundlers for React Native web resolve it in
 * place of the native file, so `ConsentProvider`, the hooks and the
 * integrations run against the browser engine from `@c15t/core` instead of a
 * TurboModule, and an iOS or Android bundle reads exactly the code it read
 * before. Keep the export list equal to `client.ts`.
 *
 * A web build has no binary to read the project URL from. The Expo config
 * plugin writes the same options it puts in the binary to `extra.inth`, and
 * Expo's bundler inlines the app config into the web bundle, so that is
 * where the configuration comes from.
 */

import { createWebConsentClient } from '../web/consent-client.web';
import { webOptionsFromManifest } from '../web/expo-extra.web';
import type { ConsentClient } from './client.js';

// The native module by its exact name: the pure parts are shared, and the
// extension keeps a web bundler from resolving the import back to this file.
export {
	createConsentClient,
	isProduction,
	reportBridgeDrift,
} from './client.js';
export type {
	ConsentClient,
	SnapshotEquality,
	SnapshotSelector,
} from './client.js';

/** The one client for the page, or `null` before the first provider. */
let client: ConsentClient | null = null;

/**
 * The Expo app config an Expo bundler inlined, or `undefined`.
 *
 * Expo's Babel preset replaces `process.env.APP_MANIFEST` with the app's
 * public config, as JSON, in every module of a web bundle; `expo-constants`
 * reads `expoConfig` from the same place. Reading it here keeps
 * `expo-constants` out of this package's dependencies.
 *
 * @returns The inlined config, or `undefined`.
 */
const readExpoManifest = function readExpoManifest(): unknown {
	try {
		return process.env.APP_MANIFEST;
	} catch {
		// No `process` in this bundle, so nothing was inlined.
		return undefined;
	}
};

/**
 * Get the page's consent client, creating it on first use.
 *
 * @returns The shared client over the browser engine.
 * @throws {Error} When the app config carries no `extra.inth`.
 * @throws {ProjectUrlError} When `projectUrl` is not an Inth project URL.
 */
export const getConsentClient = function getConsentClient(): ConsentClient {
	if (client === null) {
		const options = webOptionsFromManifest(readExpoManifest());
		if (options === null) {
			throw new Error(
				'@inth/react-native has no web configuration. A web build has no native binary to read the project URL from, so it reads extra.inth, which the Expo config plugin "@inth/react-native" writes and the Expo bundler inlines. Add the plugin to app.config.ts, and restart the bundler with --clear after changing it.'
			);
		}
		client = createWebConsentClient(options);
	}

	return client;
};

/**
 * Make `next` the page's shared client, so {@link getConsentClient} returns it.
 *
 * Only `@inth/react-native/testing` calls this, so an app's own
 * `<ConsentProvider>` reaches the test client under a web test preset too.
 *
 * @internal
 * @param next - The client to share. The previous one is disposed.
 */
export const setConsentClient = function setConsentClient(
	next: ConsentClient
): void {
	if (client !== next) {
		client?.dispose();
	}
	client = next;
};

/**
 * Stop the browser engine and drop the shared client.
 *
 * @internal
 */
export const resetConsentClient = function resetConsentClient(): void {
	client?.dispose();
	client = null;
};
