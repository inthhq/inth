import { hosted } from '@inth/sdk-core/transports';
import { manifest } from '@inth/sdk-core/transports/manifest-browser';

import type { CreateConsentClientContext } from './client-base';
import { createGlobalWith } from './global-base';
import type { InthGlobalBase } from './global-base';
import { createScriptTagConsentClient } from './script-tag-client';

export { autoInit, GLOBAL_NAME, installGlobal } from './global-base';
export type { InthGlobalBase, QueuedCall } from './global-base';

/** The global API installed by the browser bundle with the hosted and manifest transports. */
export interface InthGlobal extends InthGlobalBase {
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
): InthGlobal {
	return Object.assign(
		createGlobalWith(context, createScriptTagConsentClient),
		{ hosted, manifest }
	);
};
