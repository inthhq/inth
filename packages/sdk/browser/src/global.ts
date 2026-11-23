import { hosted } from '@inth/sdk-core/transports';
import { manifest } from '@inth/sdk-core/transports/manifest-browser';

import type { CreateConsentClientContext } from './create-consent-client-with';
import { createGlobalWith } from './create-global-with';
import type { GlobalApiBase } from './create-global-with';
import { createScriptTagConsentClient } from './create-script-tag-consent-client';

export { autoInit, installGlobal } from './create-global-with';
export { GLOBAL_NAME } from './global-name';
export type { GlobalApiBase, QueuedCall } from './create-global-with';

/** The global API installed by the browser bundle with the hosted and manifest transports. */
export interface GlobalApi extends GlobalApiBase {
	/** Transport factories, for `init({ mode: inth.manifest({ inputs }) })`. */
	hosted: typeof hosted;
	manifest: typeof manifest;
}

/**
 * Build the global API with the hosted and manifest transports.
 *
 * @param context - Entry-point wiring (UI mounter, package name).
 * @returns The API, not yet installed on `window`.
 */
export const createGlobal = function createGlobal(
	context: CreateConsentClientContext
): GlobalApi {
	return Object.assign(
		createGlobalWith(context, createScriptTagConsentClient),
		{ hosted, manifest }
	);
};
