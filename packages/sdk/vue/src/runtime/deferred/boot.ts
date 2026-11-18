/**
 * Server side of the Nuxt plugin's deferred engine: whether the browser may
 * render this visitor from the server's snapshot and load the consent
 * engine later (`shell.ts`), and the manifest key of the engine chunk.
 * Only the server render imports it.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import { isIABConfigured } from '@inth/sdk/runtime';
import { planInstantCommit } from '@inth/sdk/surface-actions/instant-commit';

import type { RuntimeConsentConfig } from '../kernel';
import { isRunnableNow } from './scripts';

/**
 * Key of the engine chunk in the client manifest the module adds at build
 * time (`preloadDeferredEngine` in `prefetch.ts`). A server render that
 * adds it to `ssrContext.modules` preloads the engine and its imports.
 *
 * @internal
 */
export const DEFERRED_ENGINE_MANIFEST_KEY = 'c15t:deferred-engine';

/** State the Nuxt payload carries for a deferred browser start. @internal */
export interface NuxtConsentBoot {
	/** The snapshot the server rendered the page from. */
	s: ConsentSnapshot;
}

/**
 * Whether the browser may start this visitor from the server's snapshot
 * and load the engine after the page: the stock banner asks for a choice,
 * an accept and a reject are both something the first-load chunk can
 * record on its own (`planInstantCommit`), nothing optional is granted
 * yet, and no option needs the engine at once (IAB, an experiment, a
 * consent source, GPP, the network blocker, or a configured script that
 * may run now and the server did not start).
 *
 * @param snapshot - The snapshot the server rendered with.
 * @param config - The app's c15t config.
 * @param now - The clock. Defaults to `Date.now()`.
 * @returns `true` when the engine may wait.
 * @internal
 */
export const canDeferEngine = function canDeferEngine(
	snapshot: ConsentSnapshot,
	config: Partial<RuntimeConsentConfig>,
	now: number = Date.now()
): boolean {
	if (
		snapshot.activeUI !== 'banner' ||
		snapshot.model === 'iab' ||
		snapshot.experiment ||
		snapshot.experimentPending ||
		isIABConfigured(config.iab) ||
		config.consentSource ||
		config.experiment ||
		config.gpp ||
		(config.networkBlocker && config.networkBlocker.enabled !== false)
	) {
		return false;
	}
	// The app's categories (configured and discovered): a permissive scope
	// grants the ones outside the policy, which gate nothing here.
	const permissions = snapshot.effectivePermissions as Record<
		string,
		boolean | undefined
	>;
	const granted = (snapshot.consentCategories ?? Object.keys(permissions)).some(
		(category) => category !== 'necessary' && permissions[category]
	);
	if (granted) {
		return false;
	}
	const serverStart = config.scriptLoader?.serverStart !== false;
	if (
		config.scripts?.some(
			(script) =>
				isRunnableNow(script, snapshot) &&
				!(serverStart && script.serverStart && script.src)
		)
	) {
		return false;
	}
	return (['all', 'none'] as const).every(
		(choice) =>
			planInstantCommit({
				actionAt: now,
				choice,
				now,
				snapshot,
				subjectId: 'boot-check',
			}) !== null
	);
};
