import { hosted } from '@inth/sdk-core/transports';

import type { CreateConsentClientContext } from './client-base';
import { createGlobalWith } from './global-base';
import type { GlobalApiBase } from './global-base';
import { createHostedConsentClient } from './hosted-client';

/** The global API installed by the hosted browser bundle. */
export interface HostedGlobalApi extends GlobalApiBase {
	/** Hosted transport factory for `init({ mode: inth.hosted({ projectUrl }) })`. */
	hosted: typeof hosted;
}

/**
 * Build the global API with the hosted transport.
 *
 * @param context - Entry-point wiring (UI mounter, package name).
 * @returns The API, not yet installed on `window`.
 * @throws {Error} When the script tag names a different mode.
 * @internal
 */
export const createHostedGlobal = function createHostedGlobal(
	context: CreateConsentClientContext = {}
): HostedGlobalApi {
	return Object.assign(
		createGlobalWith(
			{ ...context, pkg: context.pkg ?? '@inth/sdk/hosted' },
			createHostedConsentClient,
			'hosted'
		),
		{ hosted }
	);
};
