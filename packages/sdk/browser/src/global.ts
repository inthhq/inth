import { hosted } from '@inth/sdk-core/transports';
import { manifest } from '@inth/sdk-core/transports/manifest-browser';

import type { CreateConsentClientContext } from './client-base';
import { createGlobalWith } from './global-base';
import type { C15tGlobalBase } from './global-base';
import { createScriptTagConsentClient } from './script-tag-client';

export { autoInit, GLOBAL_NAME, installGlobal } from './global-base';
export type { C15tGlobalBase, QueuedCall } from './global-base';

/** The global API installed by the browser bundle with the hosted and manifest transports. */
export interface C15tGlobal extends C15tGlobalBase {
	/** Transport factories, for `init({ mode: c15t.manifest({ inputs }) })`. */
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
): C15tGlobal {
	return Object.assign(
		createGlobalWith(context, createScriptTagConsentClient),
		{ hosted, manifest }
	);
};
