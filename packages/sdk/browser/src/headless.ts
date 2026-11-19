/**
 * `@inth/sdk/headless` — the client without any UI or CSS.
 *
 * For sites that render their own banner: subscribe to the client, call
 * `acceptAll()` / `rejectAll()` / `save()`, or mark page elements with
 * `data-inth-action` and let the client wire them.
 *
 * @example
 * ```ts
 * import { init } from '@inth/sdk/headless';
 *
 * const inth = init({ projectUrl: 'https://your-project.inth.app' });
 * inth.on('ui', (surface) => banner.hidden = surface !== 'banner');
 * ```
 */

import type { WithProjectUrl } from '@inth/sdk-core/runtime';

import { createConsentClient as createClient } from './client';
import type { ConsentClient, ConsentClientOptions } from './types';

const PKG = '@inth/sdk/headless';

/** Create the page's client without starting it. `mountUI()` throws. */
export const createConsentClient = function createConsentClient(
	options: WithProjectUrl<ConsentClientOptions>
): ConsentClient {
	return createClient({ ...options, ui: false }, { pkg: PKG });
};

/** Create and start the page's client with no UI. */
export const init = function init(
	options: WithProjectUrl<ConsentClientOptions>
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
} from '@inth/sdk-core';
export { ACTION_ATTRIBUTE, PREFERENCES_HASH } from './client';
export type { PageAction } from './client';
export { getEventDispatcher } from '@inth/sdk-core/events';
export type {
	EventDispatcher,
	EventProperties,
	RuntimeEventDispatcherOptions as GetEventDispatcherOptions,
} from '@inth/sdk-core/events';
export type {
	AcceptDocumentsOptions,
	DocumentCheck,
	RuntimeDocuments,
} from '@inth/sdk-core/runtime/documents';
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
} from '@inth/sdk-core';
