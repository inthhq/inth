/**
 * Whether a script may run under the state a deferred root's stand-in
 * reads. Small, so the first-load chunk can ask before the engine loads.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@c15t/core';
import type { Script } from '@c15t/core/modules/script-loader';
import { scriptsNeedEngine as coreScriptsNeedEngine } from '@c15t/core/surface-actions/plain-scripts';

import { pageRender, readConsentBoot } from './boot';

export {
	isPlainScript,
	isRunnableNow,
	observesConsent,
} from '@c15t/core/surface-actions/plain-scripts';

/**
 * Whether this render's server start marked `script` as one it starts
 * (`starts` in its page object, {@link pageRender}). A `serverStart` that
 * returned nothing or threw, a resource two scripts share, or a newer
 * decision in the browser leaves the entry unmarked, for the loader.
 *
 * @param script - One of the root's `scripts`.
 * @returns `false` outside a browser, or when the page marked nothing.
 * @internal
 */
export const serverStartedInPage = function serverStartedInPage(
	script: Pick<Script, 'id' | 'resourceKey'>
): boolean {
	// Boot data without a render id comes from a root that does not name
	// its renders: it counts a `serverStart` entry as started, as before.
	if (readConsentBoot()?.i === undefined) {
		return true;
	}
	return pageRender()?.starts?.[script.resourceKey ?? script.id] === 1;
};

/**
 * Whether one of a root's `scripts` may run now and has to wait for the
 * engine to do it: the server did not start it from the HTML.
 *
 * @param scripts - The root's `scripts`.
 * @param snapshot - The snapshot the stand-in reads.
 * @param serverStart - Whether the root's server start is on.
 * @param plainStart - Whether the root starts plain scripts without the
 * engine (a returning visitor's stored choice).
 * @param started - Whether the server started a `serverStart` entry.
 * Defaults to the page's marks ({@link serverStartedInPage}).
 * @returns `true` when the engine should load at once.
 * @internal
 */
export const scriptsNeedEngine = function scriptsNeedEngine(
	scripts: readonly Script[] | undefined,
	snapshot: ConsentSnapshot,
	serverStart: boolean,
	plainStart = false,
	started: (script: Script) => boolean = serverStartedInPage
): boolean {
	return coreScriptsNeedEngine(
		scripts,
		snapshot,
		serverStart,
		plainStart,
		started
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
