import type { InitOutput } from '@inth/sdk-schema/types';

import type { GlobalVendorList, InitContext, KernelJourney } from '../types';

/**
 * Request context captured alongside server-fetched init data so the
 * client can decide whether the payload still matches the live request.
 */
export interface SSRInitRequestContext {
	projectUrl: string;
	country: string | null;
	region: string | null;
	language: string | null;
	gpc: boolean;
	credentials?: RequestCredentials;
	/**
	 * The manifest runtime level the request sent as `manifestLevel`. Absent
	 * means level 1, as the Inth server reads a request without one.
	 */
	manifestLevel?: number;
}

/**
 * Metadata describing how server-side init data was obtained.
 */
export interface SSRInitRequestMetadata {
	requestContext?: SSRInitRequestContext;
	/**
	 * The consent journey the early request carried, or `null` for none.
	 * Absent when the producer does not say; a runtime whose journey differs
	 * sends its own `/v1/consent/init` instead.
	 */
	journey?: KernelJourney | null;
	/**
	 * The experiment arm the early request carried, or `null` for none.
	 * Absent when the producer does not say; a runtime whose arm differs
	 * sends its own `/v1/consent/init` instead.
	 */
	experiment?: InitContext['experiment'] | null;
	requestDurationMs?: number;
	cache?: {
		isHit: boolean;
		detail: string | null;
	};
}

/**
 * Init data fetched on the server and handed to the client provider.
 */
export interface SSRInitialData {
	init: InitOutput | undefined;
	gvl?: GlobalVendorList | null;
	metadata?: SSRInitRequestMetadata;
}
