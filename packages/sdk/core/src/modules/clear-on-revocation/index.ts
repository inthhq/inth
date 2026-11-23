import { createClearOnRevocationWith } from './clear';
import { clearOnRevocationTools } from './tools';
import type {
	ClearOnRevocationHandle,
	ClearOnRevocationOptions,
} from './clear-on-revocation.model';

export type {
	ClearOnRevocationConfig,
	ClearOnRevocationCookie,
	ClearOnRevocationHandle,
	ClearOnRevocationOptions,
	ClearOnRevocationTargets,
} from './clear-on-revocation.model';

/**
 * Remove configured browser data for denied optional consent categories.
 * Waits for policy resolution, then clears once on attachment and whenever
 * a granted category becomes denied. Draft edits do not trigger cleanup.
 * Browser storage failures are ignored so consent changes can still complete.
 *
 * @returns A subscription handle. Disposing does not clear data.
 * @example
 * ```ts
 * const cleanup = createClearOnRevocation({
 *   kernel,
 *   config: { measurement: { cookies: ['_ga', '_ga_*'] } },
 * });
 * ```
 */
export const createClearOnRevocation = (
	options: ClearOnRevocationOptions
): ClearOnRevocationHandle =>
	createClearOnRevocationWith(options, clearOnRevocationTools);
