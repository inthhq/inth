/**
 * `@inth/sdk/hosted`: the hosted client and stock UI.
 */
import type { WithProjectUrl } from '@inth/sdk-core/runtime';

import { createHostedConsentClient } from './hosted-client';
import type { ConsentClient, HostedConsentClientOptions } from './types';
import { mountConsentUI } from './ui/mount';

/**
 * Create a hosted client without starting it.
 *
 * @returns The client. Call `start()` to resolve the policy and mount.
 * @throws {Error} When options require another bundle.
 */
export const createConsentClient = function createConsentClient(
	options: WithProjectUrl<HostedConsentClientOptions>
): ConsentClient {
	return createHostedConsentClient(options, {
		mountUI: mountConsentUI,
		pkg: '@inth/sdk/hosted',
	});
};

/**
 * Create and start a hosted client, mounting the UI unless `ui: false`.
 *
 * @throws {Error} When options require another bundle.
 */
export const init = function init(
	options: WithProjectUrl<HostedConsentClientOptions>
): ConsentClient {
	const client = createConsentClient(options);
	client.start();
	return client;
};

export { ACTION_ATTRIBUTE, PREFERENCES_HASH } from './client-base';
export type { PageAction } from './client-base';
export {
	ACTIVATED_ATTRIBUTE,
	activateGatedScripts,
	CATEGORY_ATTRIBUTE,
} from './gated-scripts';
export { hosted } from '@inth/sdk-core/modes';
export type { HostedMode } from '@inth/sdk-core/modes';
export type {
	ConsentBannerOptions,
	ConsentClient,
	ConsentClientEventMap,
	ConsentDialogOptions,
	HostedConsentClientOptions,
	ConsentSaveInput,
	ConsentTriggerOptions,
	ConsentUIHandle,
	ConsentUIOptions,
	TriggerPosition,
} from './types';
export { mountConsentUI } from './ui/mount';
export { getEventDispatcher } from '@inth/sdk-core/events';
export type {
	EventDispatcher,
	EventProperties,
	RuntimeEventDispatcherOptions as GetEventDispatcherOptions,
} from '@inth/sdk-core/events';
export { version } from './version';
export type {
	ConsentSnapshot,
	ConsentState,
	OptOutState,
	ResolvedVendor,
	Vendor,
	VendorChoice,
} from '@inth/sdk-core';
