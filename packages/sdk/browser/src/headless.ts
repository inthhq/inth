/**
 * `@c15t/browser/headless` — the client without any UI or CSS.
 *
 * For sites that render their own banner: subscribe to the client, call
 * `acceptAll()` / `rejectAll()` / `save()`, or mark page elements with
 * `data-c15t-action` and let the client wire them.
 *
 * @example
 * ```ts
 * import { init } from '@c15t/browser/headless';
 *
 * const c15t = init({ backendURL: 'https://your-project.inth.app' });
 * c15t.on('ui', (surface) => banner.hidden = surface !== 'banner');
 * ```
 */

import type { WithBackendURL } from '@c15t/core/runtime';

import { createConsentClient as createClient } from './client';
import type { ConsentClient, ConsentClientOptions } from './types';

const PKG = '@c15t/browser/headless';

/**
 * Create the page's client without starting it. `mountUI()` throws.
 *
 * @param options - Client options.
 * @returns The client.
 */
export const createConsentClient = function createConsentClient(
	options: WithBackendURL<ConsentClientOptions>
): ConsentClient {
	return createClient({ ...options, ui: false }, { pkg: PKG });
};

/**
 * Create and start the page's client with no UI.
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

export {
	resolveActionLabels,
	resolveConsentPresentation,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@c15t/core';
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
	ConsentClient,
	ConsentClientEventMap,
	ConsentClientBaseOptions,
	ConsentClientOptions,
	ConsentModeName,
	ScriptTagClientOptions,
	ConsentSaveInput,
} from './types';
export { version } from './version';
export type {
	ConsentSnapshot,
	ConsentState,
	PreferenceControl,
	PresentationAction,
	PromptCopy,
	ResolvedConsentPresentation,
	ResolvedVendor,
	Vendor,
	VendorChoice,
} from '@c15t/core';
