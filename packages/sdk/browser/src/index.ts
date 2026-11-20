/**
 * `@inth/sdk` — consent for sites without a build step.
 *
 * Most sites load `dist/inth.js` from a CDN and never import this module.
 * This ES module asks the backend's `/v1/consent/init` by default; `mode: manifest()`
 * resolves from the consent manifest instead, and is left out of the
 * bundle when the page does not import it. Tests pass `testing()` from
 * `@inth/sdk/testing`. The headless subset lives at
 * `@inth/sdk/headless`.
 *
 * @example
 * ```ts
 * import { init } from '@inth/sdk';
 * import '@inth/sdk/styles.css'; // only with `ui: { shadow: false }`
 *
 * const inth = init({ projectUrl: 'https://your-project.inth.app' });
 * inth.on('consent', (snapshot) => console.log(snapshot.effectivePermissions));
 * ```
 */

import type { WithProjectUrl } from '@inth/sdk-core/runtime';

import { createConsentClient as createClient } from './client';
import type { ConsentClient, ConsentClientOptions } from './types';
import { mountConsentUI } from './ui/mount';

const PKG = '@inth/sdk';

/**
 * Create the page's client without starting it. Call `start()` to resolve
 * the policy and mount.
 */
export const createConsentClient = function createConsentClient(
	options: WithProjectUrl<ConsentClientOptions>
): ConsentClient {
	return createClient(options, { mountUI: mountConsentUI, pkg: PKG });
};

/** Create and start the page's client, mounting the UI unless `ui: false`. */
export const init = function init(
	options: WithProjectUrl<ConsentClientOptions>
): ConsentClient {
	const client = createConsentClient(options);
	client.start();
	return client;
};

export { ACTION_ATTRIBUTE, PREFERENCES_HASH } from './client';
export type { PageAction } from './client';
export { getEventDispatcher } from '@inth/sdk-core/events';
export type {
	EventDispatcher,
	EventProperties,
	RuntimeEventDispatcherOptions as GetEventDispatcherOptions,
} from '@inth/sdk-core/events';
export { hosted } from '@inth/sdk-core/modes';
export type { HostedMode } from '@inth/sdk-core/modes';
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
	OptOutLinkVariant,
	ResolvedVendor,
	Vendor,
	VendorChoice,
} from '@inth/sdk-core';
