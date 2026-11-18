/**
 * `@c15t/browser` — consent for sites without a build step.
 *
 * Most sites load `dist/c15t.js` from a CDN and never import this module.
 * This ES module asks the backend's `/init` by default; `mode: manifest()`
 * resolves from the consent manifest instead, and is left out of the
 * bundle when the page does not import it. Tests pass `testing()` from
 * `@c15t/browser/testing`. The headless subset lives at
 * `@c15t/browser/headless`.
 *
 * @example
 * ```ts
 * import { init } from '@c15t/browser';
 * import '@c15t/browser/styles.css'; // only with `ui: { shadow: false }`
 *
 * const c15t = init({ backendURL: 'https://your-project.inth.app' });
 * c15t.on('consent', (snapshot) => console.log(snapshot.effectivePermissions));
 * ```
 */

import type { WithBackendURL } from '@c15t/core/runtime';

import { createConsentClient as createClient } from './client';
import type { ConsentClient, ConsentClientOptions } from './types';
import { mountConsentUI } from './ui/mount';

const PKG = '@c15t/browser';

/**
 * Create the page's client without starting it.
 *
 * @param options - Client options.
 * @returns The client. Call `start()` to resolve the policy and mount.
 */
export const createConsentClient = function createConsentClient(
	options: WithBackendURL<ConsentClientOptions>
): ConsentClient {
	return createClient(options, { mountUI: mountConsentUI, pkg: PKG });
};

/**
 * Create and start the page's client, mounting the UI unless `ui: false`.
 *
 * @param options - Client options.
 * @returns The started client.
 */
export const init = function init(
	options: WithBackendURL<ConsentClientOptions>
): ConsentClient {
	const client = createConsentClient(options);
	client.start();
	return client;
};

export { ACTION_ATTRIBUTE, PREFERENCES_HASH } from './client';
export type { PageAction } from './client';
export { getEventDispatcher } from '@c15t/core/events';
export type {
	EventDispatcher,
	EventProperties,
	RuntimeEventDispatcherOptions as GetEventDispatcherOptions,
} from '@c15t/core/events';
export { hosted } from '@c15t/core/modes';
export type { HostedMode } from '@c15t/core/modes';
export {
	ACTIVATED_ATTRIBUTE,
	activateGatedScripts,
	CATEGORY_ATTRIBUTE,
} from './gated-scripts';
export { manifest, manifestNeedsLocation } from './transports/manifest';
export type {
	BrowserManifestModeFactory,
	ManifestModeOptions,
} from './transports/manifest';
export type {
	ConsentBannerOptions,
	ConsentClient,
	ConsentClientEventMap,
	ConsentClientBaseOptions,
	ConsentClientOptions,
	ConsentModeName,
	ScriptTagClientOptions,
	ConsentDialogOptions,
	ConsentSaveInput,
	ConsentTriggerOptions,
	ConsentUIHandle,
	ConsentUIOptions,
	TriggerPosition,
} from './types';
export { mountConsentUI } from './ui/mount';
export { version } from './version';
export type {
	ConsentSnapshot,
	ConsentState,
	ResolvedVendor,
	Vendor,
	VendorChoice,
} from '@c15t/core';
