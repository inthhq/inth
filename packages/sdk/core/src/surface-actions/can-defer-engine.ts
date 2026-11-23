/**
 * Whether a server render may let the browser start a visitor from its
 * snapshot and load the consent engine after the page. Every deferred
 * root reads this one rule, through `@inth/sdk/server`: only server
 * code imports it.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '../consent-kernel.model';
import { consentPending } from '../consent-pending';
import type { Script } from '../libs/script-loader/script.model';
import { isIABConfigured } from '../runtime/is-iab-configured';
import { planInstantCommit } from './instant-commit';
import { awaitsChoice, isRunnableNow } from './plain-scripts';

/** The options {@link canDeferEngine} reads. @internal */
export interface DeferEngineOptions {
	iab?: { enabled?: boolean } | false | null;
	consentSource?: unknown;
	experiment?: unknown;
	gpp?: unknown;
	networkBlocker?: { enabled?: boolean } | false;
	enabled?: boolean;
	persistence?: unknown;
	scripts?: readonly Script[];
	/**
	 * `serverStart: false`, or a framework whose server starts no script:
	 * a `serverStart` script then waits for the engine like any other.
	 */
	scriptLoader?: { serverStart?: boolean };
	/** Cross-domain user consent option; always routes through the kernel. */
	userConsent?: unknown;
}

/**
 * Whether the visitor's state or an option needs the engine as the page
 * loads, whatever the visitor still has to answer: IAB, an experiment, an
 * external CMP's permissions, a consent source, GPP, the network blocker,
 * `enabled: false`, `persistence: false`, an account layer, or `userConsent`.
 *
 * @internal
 */
export const engineNeededNow = function engineNeededNow(
	snapshot: ConsentSnapshot,
	options: DeferEngineOptions
): boolean {
	return Boolean(
		consentPending(snapshot) ||
		snapshot.hasAccountLayer ||
		options.userConsent !== undefined ||
		snapshot.model === 'iab' ||
		snapshot.experiment ||
		snapshot.experimentPending ||
		snapshot.externalPermissions ||
		isIABConfigured(options.iab) ||
		options.consentSource ||
		options.experiment ||
		options.gpp ||
		(options.networkBlocker && options.networkBlocker.enabled !== false) ||
		options.enabled === false ||
		options.persistence === false
	);
};

/**
 * Whether the browser may start this visitor from the server's snapshot
 * and record a banner tap without the engine: no option needs the engine
 * at once ({@link engineNeededNow}), the visitor {@link awaitsChoice}, no
 * configured script may run now that the server did not start, and an
 * accept and a reject are both something the first-load chunk can record
 * on its own (`planInstantCommit`).
 *
 * @param snapshot - The snapshot the server rendered with.
 * @param options - The root's options.
 * @param now - The clock. Defaults to `Date.now()`.
 * @internal
 */
export const canDeferEngine = function canDeferEngine(
	snapshot: ConsentSnapshot,
	options: DeferEngineOptions,
	now: number = Date.now()
): boolean {
	if (engineNeededNow(snapshot, options) || !awaitsChoice(snapshot)) {
		return false;
	}
	const serverStart = options.scriptLoader?.serverStart !== false;
	if (
		options.scripts?.some(
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
