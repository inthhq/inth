/**
 * Server side of the deferred engine: whether the browser may render this
 * visitor from the server's snapshot and load the consent engine after the
 * page, and the boot that carries the snapshot. Only the server render
 * loads this module.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import { defaultTranslationConfig } from '@inth/sdk/runtime/provider';
import type { ConsentProviderRuntime } from '@inth/sdk/runtime/provider';
import {
	canDeferEngine as canDeferBanner,
	engineNeededNow,
} from '@inth/sdk/server';
import {
	isPlainScript,
	isRunnableNow,
} from '@inth/sdk/surface-actions/plain-scripts';
import { deepMergeTranslations } from '@inth/sdk/translations';
import type { Translations } from '@inth/sdk/translations';

import { isIABConfigured } from '../iab-loader';
import type { InthResolvedOptions } from '../options';
import type { ConsentBoot } from './boot';

/**
 * A decision that changes on its own this soon is left to the engine,
 * which re-evaluates it on time.
 */
const DEADLINE_MARGIN_MS = 60_000;

/**
 * Whether a visitor with nothing to answer, such as one who chose on an
 * earlier visit, can wait for the engine: every script that may run now
 * is one the server starts or a plain `src` the first-load chunk inserts
 * the way the loader would (`startPlainScripts`), and no decision expires
 * soon.
 */
const canDeferAnswered = function canDeferAnswered(
	snapshot: ConsentSnapshot,
	options: InthResolvedOptions,
	now: number
): boolean {
	if (
		snapshot.resolution.status !== 'matched' ||
		snapshot.policyPending ||
		(snapshot.nextDeadline !== null &&
			snapshot.nextDeadline - now < DEADLINE_MARGIN_MS)
	) {
		return false;
	}
	const serverStart = options.scriptLoader?.serverStart !== false;
	return !options.scripts?.some(
		(script) =>
			isRunnableNow(script, snapshot) &&
			!isPlainScript(script) &&
			!(serverStart && script.serverStart && script.src)
	);
};

/**
 * Whether the browser may start this visitor from the server's snapshot
 * and load the engine after the page. No option may need the engine at
 * once (`engineNeededNow`). Then either the stock banner asks for a choice
 * the first-load chunk can record (core's `canDeferEngine`, the rule of
 * every deferred root), or nothing is shown and every script that may run
 * is one the first-load chunk or the server starts (`canDeferAnswered`).
 *
 * @param snapshot - The snapshot the server rendered with.
 * @param now - The clock. Defaults to `Date.now()`.
 * @internal
 */
export const canDeferEngine = function canDeferEngine(
	snapshot: ConsentSnapshot,
	options: InthResolvedOptions,
	now: number = Date.now()
): boolean {
	if (snapshot.activeUI === 'none') {
		return (
			!engineNeededNow(snapshot, options) &&
			canDeferAnswered(snapshot, options, now)
		);
	}
	return canDeferBanner(snapshot, options, now);
};

/**
 * The snapshot's copy with every key the English defaults have. The
 * surfaces read the active language's bundle as a whole, so the server
 * fills the gaps of a partial bundle. An English bundle comes back
 * unchanged. The IAB copy is left out unless the app configured IAB.
 *
 * @param snapshot - The snapshot the server rendered with.
 * @internal
 */
export const withCompleteTranslations = function withCompleteTranslations(
	snapshot: ConsentSnapshot,
	withIAB = false
): ConsentSnapshot {
	const { iab, ...rest } = defaultTranslationConfig.translations
		.en as Translations;
	const english = withIAB ? { ...rest, iab } : rest;
	const resolved = snapshot.translations;
	return {
		...snapshot,
		translations: {
			...resolved,
			language: resolved?.language ?? 'en',
			translations: deepMergeTranslations(
				english as Translations,
				(resolved?.translations ?? {}) as Partial<Translations>
			) as NonNullable<ConsentSnapshot['translations']>['translations'],
		},
	};
};

/**
 * The boot for a server render.
 *
 * @param runtime - The server's runtime, not started.
 * @param options - The provider's options, with its `prefetch`.
 * @returns The boot to leave in `TransferState`.
 * @internal
 */
export const planServerBoot = function planServerBoot(
	runtime: ConsentProviderRuntime,
	options: InthResolvedOptions
): ConsentBoot {
	const snapshot = runtime.kernel.getServerSnapshot();
	const boot: ConsentBoot = {
		s: withCompleteTranslations(snapshot, isIABConfigured(options.iab)),
	};
	if (canDeferEngine(snapshot, options)) {
		boot.d = 1;
	}
	if (runtime.experiment) {
		boot.x = runtime.experiment;
	}
	// The vendor list can be large, and the server state already holds it.
	const gvl = options.prefetch?.initialIab?.gvl;
	if (gvl && snapshot.iab?.gvl === gvl) {
		boot.s = { ...boot.s, iab: { ...snapshot.iab, gvl: null } };
		boot.g = 1;
	}
	return boot;
};
