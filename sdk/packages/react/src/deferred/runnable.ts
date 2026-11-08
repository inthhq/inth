/**
 * Whether a script may run under the state a deferred root's stand-in
 * reads. Small, so the first-load chunk can ask before the engine loads.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@c15t/core';
import type { Script } from '@c15t/core/modules/script-loader';
import { isRunnableNow } from '@c15t/core/surface-actions/plain-scripts';

export {
	isPlainScript,
	isRunnableNow,
} from '@c15t/core/surface-actions/plain-scripts';

/**
 * Whether one of a root's `scripts` may run now and has to wait for the
 * engine to do it: the server did not start it from the HTML.
 *
 * @param scripts - The root's `scripts`.
 * @param snapshot - The snapshot the stand-in reads.
 * @param serverStart - Whether the root's server start is on.
 * @returns `true` when the engine should load at once.
 * @internal
 */
export const scriptsNeedEngine = function scriptsNeedEngine(
	scripts: readonly Script[] | undefined,
	snapshot: ConsentSnapshot,
	serverStart: boolean
): boolean {
	return Boolean(
		scripts?.some(
			(script) =>
				isRunnableNow(script, snapshot) &&
				!(serverStart && script.serverStart && script.src)
		)
	);
};

/**
 * The permissions accepting every category the visitor is asked about
 * would grant, for a guess that may only fetch early: `null` under a
 * privacy signal, which the evaluator applies.
 *
 * @param snapshot - The snapshot the banner shows.
 * @returns The permissions, or `null`.
 * @internal
 */
export const acceptedPermissions = function acceptedPermissions(
	snapshot: ConsentSnapshot
): ConsentSnapshot['effectivePermissions'] | null {
	if (snapshot.privacySignals?.gpc?.active) {
		return null;
	}
	const granted = { ...snapshot.effectivePermissions };
	for (const category of snapshot.evaluationPolicy?.choiceScope ??
		snapshot.policyRule.scope) {
		granted[category] = true;
	}
	return granted;
};
