/**
 * The engine's side of the handoff: the init script's boot object, kept
 * once `installGlobal` has replaced the stand-in, until the client has
 * taken what it needs from it.
 *
 * @packageDocumentation
 * @internal
 */

import type { ScriptTagClientOptions } from '../types';
import { version } from '../version';
import type { InitBoot } from './boot';
import { supportsEarlyStart } from './eligibility';
import { readHostedMarker } from './hosted-marker';

let adopted: InitBoot | null = null;

/**
 * Keep the boot object the engine was installed over.
 *
 * @internal
 */
export const adoptBoot = function adoptBoot(boot: InitBoot): void {
	adopted = boot;
};

/**
 * Forget the boot object. Called when the client it was handed to is
 * disposed.
 *
 * @internal
 */
export const releaseBoot = function releaseBoot(): void {
	adopted = null;
};

/**
 * The boot object the engine was installed over, if any.
 *
 * @internal
 */
export const adoptedBoot = function adoptedBoot(): InitBoot | null {
	return adopted;
};

/**
 * `options` with the `/v1/consent/init` answer the init script read as `prefetch`,
 * when they send the same request: the engine then starts with the policy
 * and sends no `/v1/consent/init` of its own. Evaluated now, after any choice the
 * init script stored.
 *
 * @internal
 */
export const withInitPrefetch = function withInitPrefetch(
	options: ScriptTagClientOptions
): ScriptTagClientOptions {
	const handed = adopted?.prefetch;
	if (!handed || adopted?.version !== version) {
		return options;
	}
	const projectUrl =
		options.projectUrl ?? readHostedMarker(options.mode)?.projectUrl;
	if (
		projectUrl !== handed.projectUrl ||
		!supportsEarlyStart(options, projectUrl) ||
		JSON.stringify(options.overrides ?? {}) !==
			JSON.stringify(handed.overrides ?? {})
	) {
		return options;
	}
	adopted.prefetch = null;
	return { ...options, prefetch: { ...handed.config, now: Date.now() } };
};
