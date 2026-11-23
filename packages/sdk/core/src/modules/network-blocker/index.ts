import { createNetworkBlockerWith } from './blocker';
import type {
	NetworkBlockerHandle,
	NetworkBlockerOptions,
} from './network-blocker.model';
/**
 * `@inth/sdk/modules/network-blocker`
 *
 * Kernel-consuming network blocker. Patches `window.fetch` and
 * `XMLHttpRequest.prototype.{open, send}` to intercept requests and
 * block ones whose consent condition isn't satisfied. See `blocker.ts`.
 */
import { networkBlockerTools } from './tools';

export type {
	BlockDecision,
	BlockedRequestInfo,
	NetworkBlockerConfig,
	NetworkBlockerHandle,
	NetworkBlockerOptions,
	NetworkBlockerRule,
} from './network-blocker.model';

/**
 * Create a network blocker.
 *
 * @param options - The kernel, the rules and, from a runtime, its hold.
 */
export const createNetworkBlocker = function createNetworkBlocker(
	options: NetworkBlockerOptions
): NetworkBlockerHandle {
	return createNetworkBlockerWith(options, networkBlockerTools);
};
